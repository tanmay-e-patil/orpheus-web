package apphttp

import (
	"net/http/httptest"
	"orpheus-web/internal/config"
	"os"
	"path/filepath"
	"testing"
)

func TestStaticFilesRequireRevalidation(t *testing.T) {
	webDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(webDir, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(webDir, "assets", "app.js"), []byte(""), 0o644); err != nil {
		t.Fatal(err)
	}

	response := httptest.NewRecorder()
	(&Server{WebDir: webDir}).staticOrShell(response, httptest.NewRequest("GET", "/assets/app.js", nil))

	if got := response.Header().Get("Cache-Control"); got != "no-cache" {
		t.Fatalf("Cache-Control = %q, want no-cache", got)
	}
}

func TestDeleteSongRequiresAuthentication(t *testing.T) {
	server := &Server{Auth: NewAuthService(config.Config{}, nil)}
	response := httptest.NewRecorder()
	server.Routes().ServeHTTP(response, httptest.NewRequest("DELETE", "/api/songs/track", nil))
	if response.Code != 401 {
		t.Fatalf("status = %d, want 401", response.Code)
	}
}
