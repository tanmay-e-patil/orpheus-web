package apphttp

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"orpheus-web/internal/config"
	"orpheus-web/internal/store"
)

const SessionCookieName = "orpheus_session"

type contextKey string

const (
	userIDCtxKey   contextKey = "userID"
	usernameCtxKey contextKey = "username"
)

type SessionClaims struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

type AuthService struct {
	cfg   config.Config
	store *store.Store
}

func NewAuthService(cfg config.Config, db *store.Store) *AuthService {
	return &AuthService{cfg: cfg, store: db}
}

// ValidateCredentials checks email + password against the DB.
// Falls back to legacy env-var credentials for migration, auto-provisioning a DB user.
func (a *AuthService) ValidateCredentials(email, password string) (*store.User, bool) {
	ctx := context.Background()
	log.Printf("auth login attempt email=%q legacy_email_configured=%t legacy_password_configured=%t", email, a.cfg.AuthUsername != "", a.cfg.AuthPassword != "" || a.cfg.AuthPasswordHash != "")

	// 1. Try DB lookup first (normal path)
	user, err := a.store.GetUserByEmail(ctx, email)
	if err == nil {
		log.Printf("auth db user found email=%q user_id=%q", email, user.ID)
		// Found user — check password from account table
		hash, hashErr := a.store.GetPasswordForUser(ctx, user.ID)
		if hashErr != nil {
			log.Printf("auth db password lookup failed email=%q user_id=%q error=%v", email, user.ID, hashErr)
		} else if hash == "" {
			log.Printf("auth db password missing email=%q user_id=%q", email, user.ID)
		} else if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil {
			log.Printf("auth db password matched email=%q user_id=%q", email, user.ID)
			return user, true
		} else {
			log.Printf("auth db password mismatch email=%q user_id=%q", email, user.ID)
		}
		// DB password didn't match — fall through to legacy check
	} else {
		log.Printf("auth db user lookup failed email=%q error=%v", email, err)
	}

	// 2. Legacy migration fallback: check env-var credentials
	if a.cfg.AuthUsername != "" && (a.cfg.AuthPassword != "" || a.cfg.AuthPasswordHash != "") {
		if email != a.cfg.AuthUsername {
			log.Printf("auth legacy email mismatch login_email=%q configured_email=%q", email, a.cfg.AuthUsername)
			return nil, false
		}
		if a.cfg.AuthPasswordHash != "" {
			if bcrypt.CompareHashAndPassword([]byte(a.cfg.AuthPasswordHash), []byte(password)) != nil {
				log.Printf("auth legacy password hash mismatch email=%q", email)
				return nil, false
			}
		} else if password != a.cfg.AuthPassword {
			log.Printf("auth legacy password mismatch email=%q", email)
			return nil, false
		}
		log.Printf("auth legacy credentials matched email=%q", email)
		// Legacy match — auto-provision user in DB
		user, err = a.provisionFromLegacy(ctx, email, password)
		if err != nil {
			log.Printf("auth legacy provision failed email=%q error=%v", email, err)
			return nil, false
		}
		return user, true
	}

	return nil, false
}

// provisionFromLegacy creates a user row and account row from the old env-var credentials.
// If the user already exists (e.g. created by better-auth), it just updates the password.
func (a *AuthService) provisionFromLegacy(ctx context.Context, email, password string) (*store.User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	// Check if user already exists
	user, err := a.store.GetUserByEmail(ctx, email)
	if err == nil {
		// User exists — just update the password
		if err := a.store.SetPasswordForUser(ctx, user.ID, string(hash)); err != nil {
			return nil, err
		}
		return user, nil
	}

	// User doesn't exist — create everything
	id := generateID()
	username := strings.Split(email, "@")[0]
	user, err = a.store.CreateUser(ctx, id, username, email, username)
	if err != nil {
		return nil, err
	}
	if err := a.store.CreateAccountForUser(ctx, user.ID, string(hash)); err != nil {
		return nil, err
	}
	return user, nil
}

// RegisterUser creates a new user with a bcrypt-hashed password.
func (a *AuthService) RegisterUser(username, email, password string) (*store.User, error) {
	ctx := context.Background()
	id := generateID()
	user, err := a.store.CreateUser(ctx, id, username, email, username)
	if err != nil {
		return nil, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	if err := a.store.CreateAccountForUser(ctx, user.ID, string(hash)); err != nil {
		return nil, err
	}
	return user, nil
}

func UserIDFromContext(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(userIDCtxKey).(string)
	return userID, ok && userID != ""
}

func generateID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// CreateSessionToken issues a JWT for the given user.
func (a *AuthService) CreateSessionToken(userID, username string) (string, error) {
	now := time.Now().UTC()
	claims := SessionClaims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(7 * 24 * time.Hour)),
			Issuer:    "orpheus",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(a.cfg.AuthCookieSecret))
}

// SetSessionCookie sets the JWT as an HttpOnly cookie.
func (a *AuthService) SetSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   7 * 24 * 60 * 60,
		HttpOnly: true,
		Secure:   a.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClearSessionCookie removes the session cookie.
func (a *AuthService) ClearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   a.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

// SessionFromRequest extracts and verifies a JWT from either a cookie
// (web) or an Authorization: Bearer header (Expo). Same verification path.
func (a *AuthService) SessionFromRequest(r *http.Request) (*SessionClaims, error) {
	var tokenString string

	if cookie, err := r.Cookie(SessionCookieName); err == nil && cookie.Value != "" {
		tokenString = cookie.Value
	}
	if tokenString == "" {
		if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			tokenString = strings.TrimPrefix(auth, "Bearer ")
		}
	}
	if tokenString == "" {
		return nil, errors.New("no session token")
	}

	token, err := jwt.ParseWithClaims(tokenString, &SessionClaims{}, func(t *jwt.Token) (any, error) {
		return []byte(a.cfg.AuthCookieSecret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*SessionClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid session token")
	}
	return claims, nil
}

// UserAndUsernameFromRequest returns both userID and username.
func (a *AuthService) UserAndUsernameFromRequest(r *http.Request) (string, string, error) {
	claims, err := a.SessionFromRequest(r)
	if err != nil {
		return "", "", err
	}
	return claims.UserID, claims.Username, nil
}

// HasPasskey checks if the user has any registered passkeys.
func (a *AuthService) HasPasskey(userID string) bool {
	ctx := context.Background()
	pks, err := a.store.GetPasskeysByUserID(ctx, userID)
	if err != nil {
		return false
	}
	return len(pks) > 0
}
