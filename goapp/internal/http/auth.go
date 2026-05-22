package apphttp

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"orpheus-goapp/internal/config"
	"orpheus-goapp/internal/store"
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
func (a *AuthService) ValidateCredentials(email, password string) (*store.User, bool) {
	ctx := context.Background()
	user, err := a.store.GetUserByEmail(ctx, email)
	if err != nil {
		return nil, false
	}
	if user.Password == nil {
		return nil, false
	}
	if err := bcrypt.CompareHashAndPassword([]byte(*user.Password), []byte(password)); err != nil {
		return nil, false
	}
	return user, true
}

// RegisterUser creates a new user with a bcrypt-hashed password.
func (a *AuthService) RegisterUser(username, email, password string) (*store.User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	ctx := context.Background()
	return a.store.CreateUser(ctx, username, email, string(hash))
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

// UserIDFromRequest returns just the user ID from the session.
func (a *AuthService) UserIDFromRequest(r *http.Request) (string, error) {
	claims, err := a.SessionFromRequest(r)
	if err != nil {
		return "", err
	}
	return claims.UserID, nil
}

// UserAndUsernameFromRequest returns both userID and username.
// This satisfies the handlers.Authenticator interface.
func (a *AuthService) UserAndUsernameFromRequest(r *http.Request) (string, string, error) {
	claims, err := a.SessionFromRequest(r)
	if err != nil {
		return "", "", err
	}
	return claims.UserID, claims.Username, nil
}

// UserFromRequest returns the full user object from the session.
func (a *AuthService) UserFromRequest(r *http.Request) (*store.User, error) {
	claims, err := a.SessionFromRequest(r)
	if err != nil {
		return nil, err
	}
	ctx := context.Background()
	return a.store.GetUserByID(ctx, claims.UserID)
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
