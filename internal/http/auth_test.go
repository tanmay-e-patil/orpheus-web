package apphttp

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"orpheus-web/internal/config"
)

func testAuth() *AuthService {
	return NewAuthService(config.Config{
		AuthCookieSecret: "test-secret-key-at-least-32-bytes!",
		AppEnv:           "test",
	}, nil)
}

func TestAuthSessionTokenRoundTrip(t *testing.T) {
	auth := testAuth()
	token, err := auth.CreateSessionToken("user-id-123", "testuser")
	if err != nil {
		t.Fatal(err)
	}

	// Test via cookie
	recorder := httptest.NewRecorder()
	auth.SetSessionCookie(recorder, token)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	for _, cookie := range recorder.Result().Cookies() {
		req.AddCookie(cookie)
	}
	claims, err := auth.SessionFromRequest(req)
	if err != nil {
		t.Fatal(err)
	}
	if claims.UserID != "user-id-123" {
		t.Fatalf("userID = %q, want %q", claims.UserID, "user-id-123")
	}
	if claims.Username != "testuser" {
		t.Fatalf("username = %q, want %q", claims.Username, "testuser")
	}
}

func TestAuthBearerTokenRoundTrip(t *testing.T) {
	auth := testAuth()
	token, err := auth.CreateSessionToken("user-id-456", "beareruser")
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	claims, err := auth.SessionFromRequest(req)
	if err != nil {
		t.Fatal(err)
	}
	if claims.UserID != "user-id-456" {
		t.Fatalf("userID = %q, want %q", claims.UserID, "user-id-456")
	}
}

func TestAuthRejectsTamperedToken(t *testing.T) {
	auth := testAuth()
	token, err := auth.CreateSessionToken("user-id-789", "tampered")
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+token+"tampered")
	if _, err := auth.SessionFromRequest(req); err == nil {
		t.Fatal("expected tampered token to fail")
	}
}

func TestAuthRejectsExpiredToken(t *testing.T) {
	auth := testAuth()
	claims := &SessionClaims{
		UserID:   "expired-user",
		Username: "expired",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
			Issuer:    "orpheus",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte("test-secret-key-at-least-32-bytes!"))
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)
	if _, err := auth.SessionFromRequest(req); err == nil {
		t.Fatal("expected expired token to fail")
	}
}

func TestAuthRejectsNoToken(t *testing.T) {
	auth := testAuth()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if _, err := auth.SessionFromRequest(req); err == nil {
		t.Fatal("expected missing token to fail")
	}
}
