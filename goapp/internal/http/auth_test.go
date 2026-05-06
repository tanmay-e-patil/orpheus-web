package apphttp

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"orpheus-goapp/internal/config"
)

func testAuth() *AuthService {
	return NewAuthService(config.Config{
		AuthUsername:     "user",
		AuthPassword:     "pass",
		AuthCookieSecret: "secret",
		AppEnv:           "test",
	})
}

func TestAuthSessionCookieRoundTrip(t *testing.T) {
	auth := testAuth()
	recorder := httptest.NewRecorder()
	if err := auth.SetSessionCookie(recorder, "user"); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	for _, cookie := range recorder.Result().Cookies() {
		req.AddCookie(cookie)
	}
	claims, err := auth.SessionFromRequest(req)
	if err != nil {
		t.Fatal(err)
	}
	if claims.Username != "user" {
		t.Fatalf("username = %q", claims.Username)
	}
}

func TestAuthRejectsTamperedCookie(t *testing.T) {
	auth := testAuth()
	recorder := httptest.NewRecorder()
	if err := auth.SetSessionCookie(recorder, "user"); err != nil {
		t.Fatal(err)
	}
	cookie := recorder.Result().Cookies()[0]
	cookie.Value = strings.Replace(cookie.Value, ".", "x.", 1)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(cookie)
	if _, err := auth.SessionFromRequest(req); err == nil {
		t.Fatal("expected tampered cookie to fail")
	}
}

func TestAuthRejectsExpiredCookie(t *testing.T) {
	auth := testAuth()
	value, err := auth.signClaims(SessionClaims{
		Username: "user",
		IssuedAt: time.Now().Add(-2 * time.Hour).Unix(),
		Expires:  time.Now().Add(-1 * time.Hour).Unix(),
		Nonce:    "nonce",
	})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: SessionCookieName, Value: value})
	if _, err := auth.SessionFromRequest(req); err == nil {
		t.Fatal("expected expired cookie to fail")
	}
}
