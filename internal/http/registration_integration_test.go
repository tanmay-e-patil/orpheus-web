//go:build integration

package apphttp

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"orpheus-web/internal/config"
	"orpheus-web/internal/testutil"
)

func register(t *testing.T, handler http.Handler, username string) *httptest.ResponseRecorder {
	t.Helper()
	body := `{"username":"` + username + `","email":"` + username + `@example.com","password":"correct horse"}`
	request := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func registrationServer(t *testing.T, enabled bool) http.Handler {
	t.Helper()
	db, _, _ := testutil.Postgres(t)
	cfg := config.Config{
		AuthCookieSecret:        "test-secret-key-at-least-32-bytes!",
		Domain:                  "localhost",
		AuthRPOrigin:            "http://localhost:8080",
		AuthRegistrationEnabled: enabled,
	}
	server, err := NewServer(cfg, db, nil, nil, nil, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return server.Routes()
}

func TestRegistrationClosesAfterFirstAccount(t *testing.T) {
	handler := registrationServer(t, false)
	if response := register(t, handler, "owner"); response.Code != http.StatusCreated {
		t.Fatalf("first account status = %d: %s", response.Code, response.Body)
	}
	response := register(t, handler, "stranger")
	if response.Code != http.StatusForbidden || !strings.Contains(response.Body.String(), "registration_closed") {
		t.Fatalf("second account status = %d: %s", response.Code, response.Body)
	}
	if len(response.Result().Cookies()) != 0 {
		t.Fatal("rejected registration set a session cookie")
	}
}

func TestRegistrationStaysOpenWhenEnabled(t *testing.T) {
	handler := registrationServer(t, true)
	for _, name := range []string{"owner", "friend"} {
		if response := register(t, handler, name); response.Code != http.StatusCreated {
			t.Fatalf("%s status = %d: %s", name, response.Code, response.Body)
		}
	}
}
