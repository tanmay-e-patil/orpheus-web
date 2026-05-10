package handlers

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"orpheus-goapp/internal/types"
)

func TestLibraryAudioPath(t *testing.T) {
	base := t.TempDir()
	song := types.AudioSong{
		Name:       "Track",
		ArtistName: "Artist",
		AlbumName:  "Album",
	}
	got, err := LibraryAudioPath(base, song)
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(base, "Artist", "Album", "Track.m4a")
	if got != want {
		t.Fatalf("LibraryAudioPath() = %q, want %q", got, want)
	}
}

func TestLibraryAudioPathRejectsTraversal(t *testing.T) {
	base := t.TempDir()
	tests := []types.AudioSong{
		{Name: "Track", ArtistName: "..", AlbumName: "Album"},
		{Name: "../../Track", ArtistName: "Artist", AlbumName: "Album"},
		{Name: "Track", ArtistName: "Artist", AlbumName: "../Album"},
	}
	for _, song := range tests {
		t.Run(song.ArtistName+"/"+song.AlbumName+"/"+song.Name, func(t *testing.T) {
			if _, err := LibraryAudioPath(base, song); err == nil {
				t.Fatal("expected traversal error")
			}
		})
	}
}

func TestServeContentSupportsAudioRanges(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "Track.m4a")
	if err := os.WriteFile(path, []byte("0123456789"), 0600); err != nil {
		t.Fatal(err)
	}
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/songs/track/audio", nil)
	req.Header.Set("Range", "bytes=0-3")
	rec := httptest.NewRecorder()
	rec.Header().Set("Content-Type", "audio/mp4")
	http.ServeContent(rec, req, "Track.m4a", time.Now(), file)

	if rec.Code != http.StatusPartialContent {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusPartialContent)
	}
	if got := rec.Body.String(); got != "0123" {
		t.Fatalf("body = %q, want %q", got, "0123")
	}
	if contentRange := rec.Header().Get("Content-Range"); !strings.HasPrefix(contentRange, "bytes 0-3/") {
		t.Fatalf("Content-Range = %q", contentRange)
	}
}
