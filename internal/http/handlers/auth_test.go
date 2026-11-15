package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"orpheus-web/internal/store"
)

type passwordAuth struct{ checks int }

func (a *passwordAuth) ValidateCredentials(email, password string) (*store.User, bool) {
	a.checks++
	if password != "right" {
		return nil, false
	}
	return &store.User{ID: "owner", Name: "Owner", Email: email}, true
}
func (a *passwordAuth) RegistrationOpen(context.Context) (bool, error) { return false, nil }
func (a *passwordAuth) RegisterUser(string, string, string) (*store.User, error) {
	return nil, nil
}
func (a *passwordAuth) CreateSessionToken(string, string) (string, error) { return "token", nil }
func (a *passwordAuth) SetSessionCookie(http.ResponseWriter, string)      {}
func (a *passwordAuth) ClearSessionCookie(http.ResponseWriter)            {}
func (a *passwordAuth) UserAndUsernameFromRequest(*http.Request) (string, string, error) {
	return "", "", nil
}
func (a *passwordAuth) HasPasskey(string) bool { return false }

func login(handler http.Handler, email, password string) *httptest.ResponseRecorder {
	body := `{"email":"` + email + `","password":"` + password + `"}`
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(body)))
	return response
}

func TestLoginThrottlesRepeatedFailuresPerAccount(t *testing.T) {
	now := time.Unix(1_000_000, 0)
	auth := &passwordAuth{}
	handler := Login(auth, NewLoginThrottle(func() time.Time { return now }))
	for i := range loginFailureLimit {
		if response := login(handler, "owner@example.com", "wrong"); response.Code != http.StatusUnauthorized {
			t.Fatalf("failure %d status = %d, want 401", i+1, response.Code)
		}
	}
	checks := auth.checks
	response := login(handler, " Owner@Example.com ", "right")
	if response.Code != http.StatusTooManyRequests || response.Header().Get("Retry-After") == "" {
		t.Fatalf("locked login status = %d Retry-After=%q, want 429 with Retry-After", response.Code, response.Header().Get("Retry-After"))
	}
	if auth.checks != checks {
		t.Fatal("locked login still checked the password")
	}
	if response := login(handler, "other@example.com", "right"); response.Code != http.StatusOK {
		t.Fatalf("other account status = %d, want 200", response.Code)
	}
	now = now.Add(loginFailureWindow)
	if response := login(handler, "owner@example.com", "right"); response.Code != http.StatusOK {
		t.Fatalf("after window status = %d, want 200", response.Code)
	}
}

func TestSuccessfulLoginClearsFailures(t *testing.T) {
	now := time.Unix(1_000_000, 0)
	handler := Login(&passwordAuth{}, NewLoginThrottle(func() time.Time { return now }))
	for range loginFailureLimit - 1 {
		login(handler, "owner@example.com", "wrong")
	}
	login(handler, "owner@example.com", "right")
	for range loginFailureLimit - 1 {
		login(handler, "owner@example.com", "wrong")
	}
	if response := login(handler, "owner@example.com", "right"); response.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 after a success reset the count", response.Code)
	}
}
