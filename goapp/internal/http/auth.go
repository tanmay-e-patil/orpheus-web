package apphttp

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"orpheus-goapp/internal/config"
)

const SessionCookieName = "orpheus_session"

type AuthService struct {
	cfg config.Config
}

type SessionClaims struct {
	Username string `json:"username"`
	IssuedAt int64  `json:"iat"`
	Expires  int64  `json:"exp"`
	Nonce    string `json:"nonce"`
}

func NewAuthService(cfg config.Config) *AuthService {
	return &AuthService{cfg: cfg}
}

func (a *AuthService) ValidateCredentials(username, password string) bool {
	if subtle.ConstantTimeCompare([]byte(username), []byte(a.cfg.AuthUsername)) != 1 {
		return false
	}
	if a.cfg.AuthPasswordHash != "" {
		return bcrypt.CompareHashAndPassword([]byte(a.cfg.AuthPasswordHash), []byte(password)) == nil
	}
	return subtle.ConstantTimeCompare([]byte(password), []byte(a.cfg.AuthPassword)) == 1
}

func (a *AuthService) SetSessionCookie(w http.ResponseWriter, username string) error {
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return err
	}
	now := time.Now().UTC()
	claims := SessionClaims{
		Username: username,
		IssuedAt: now.Unix(),
		Expires:  now.Add(7 * 24 * time.Hour).Unix(),
		Nonce:    base64.RawURLEncoding.EncodeToString(nonce),
	}
	value, err := a.signClaims(claims)
	if err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    value,
		Path:     "/",
		MaxAge:   7 * 24 * 60 * 60,
		HttpOnly: true,
		Secure:   a.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
	return nil
}

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

func (a *AuthService) SessionFromRequest(r *http.Request) (*SessionClaims, error) {
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil {
		return nil, err
	}
	claims, err := a.verify(cookie.Value)
	if err != nil {
		return nil, err
	}
	if claims.Expires < time.Now().UTC().Unix() {
		return nil, errors.New("session expired")
	}
	return claims, nil
}

func (a *AuthService) UsernameFromRequest(r *http.Request) (string, error) {
	claims, err := a.SessionFromRequest(r)
	if err != nil {
		return "", err
	}
	return claims.Username, nil
}

func (a *AuthService) signClaims(claims SessionClaims) (string, error) {
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	payloadEncoded := base64.RawURLEncoding.EncodeToString(payload)
	signature := a.signature(payloadEncoded)
	return payloadEncoded + "." + signature, nil
}

func (a *AuthService) verify(value string) (*SessionClaims, error) {
	parts := strings.Split(value, ".")
	if len(parts) != 2 {
		return nil, errors.New("invalid session token")
	}
	expected := a.signature(parts[0])
	if hmac.Equal([]byte(expected), []byte(parts[1])) == false {
		return nil, errors.New("invalid session signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, err
	}
	var claims SessionClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, err
	}
	if claims.Username != a.cfg.AuthUsername {
		return nil, errors.New("invalid session user")
	}
	return &claims, nil
}

func (a *AuthService) signature(payload string) string {
	mac := hmac.New(sha256.New, []byte(a.cfg.AuthCookieSecret))
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
