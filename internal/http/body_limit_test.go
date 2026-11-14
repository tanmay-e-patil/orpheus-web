package apphttp

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"orpheus-web/internal/config"
)

func limitServer() (http.Handler, string) {
	cfg := config.Config{AuthCookieSecret: "test-secret-key-at-least-32-bytes!"}
	auth := NewAuthService(cfg, nil)
	token, _ := auth.CreateSessionToken("user", "user")
	return (&Server{Config: cfg, Auth: auth}).Routes(), token
}

func TestPublicAuthRejectsOversizedBody(t *testing.T) {
	handler, _ := limitServer()
	body := `{"email":"a@example.com","password":"` + strings.Repeat("x", 1<<20) + `"}`
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(body))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("1 MiB login body status = %d, want 400 before credentials are checked", response.Code)
	}
}

func commitWithPadding(size int) string {
	return `{"items":[{"song":{"id":""},"video":{"id":"v"},"edits":{"lyrics":"` + strings.Repeat("x", size) + `"}}]}`
}

func TestAuthenticatedCommitAcceptsLargeLyricsBatch(t *testing.T) {
	handler, token := limitServer()
	for _, tc := range []struct {
		size int
		want int
	}{{size: 8 << 20, want: http.StatusOK}, {size: 40 << 20, want: http.StatusBadRequest}} {
		request := httptest.NewRequest(http.MethodPost, "/api/discover/commit", strings.NewReader(commitWithPadding(tc.size)))
		request.Header.Set("Authorization", "Bearer "+token)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != tc.want {
			t.Fatalf("%d MiB commit status = %d, want %d", tc.size>>20, response.Code, tc.want)
		}
	}
}
