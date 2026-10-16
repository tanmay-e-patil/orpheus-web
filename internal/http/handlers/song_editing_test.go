package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"orpheus-web/internal/store"
)

func TestMetadataConflictReturnsConflictResponse(t *testing.T) {
	response := httptest.NewRecorder()
	writeSongEditResponse(context.Background(), response, store.SongEditResponse{}, &pgconn.PgError{Code: "23505", ConstraintName: "songs_artist_album_name_unique"})
	if response.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", response.Code)
	}
	if !strings.Contains(response.Body.String(), `"code":"song_exists"`) {
		t.Fatalf("response = %s", response.Body.String())
	}
}
