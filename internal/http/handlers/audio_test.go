package handlers

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"orpheus-web/internal/types"
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

func TestLibraryAudioPathUsesStoredLocationDuringRename(t *testing.T) {
	base := t.TempDir()
	song := types.AudioSong{Name: "New title", ArtistName: "New artist", AlbumName: "New album", AudioFilePath: "Old artist/Old album/Old title.m4a"}
	got, err := LibraryAudioPath(base, song)
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(base, "Old artist", "Old album", "Old title.m4a"); got != want {
		t.Fatalf("path = %q, want %q", got, want)
	}
	for _, invalid := range []string{"../outside.m4a", "/outside.m4a", `Artist\..\outside.m4a`} {
		song.AudioFilePath = invalid
		if _, err := LibraryAudioPath(base, song); err == nil {
			t.Fatalf("accepted unsafe stored path %q", invalid)
		}
	}
}

func TestServeAudioFileRevalidatesWithETag(t *testing.T) {
	path := filepath.Join(t.TempDir(), "Track.m4a")
	if err := os.WriteFile(path, []byte("0123456789"), 0600); err != nil {
		t.Fatal(err)
	}
	get := func(header, value string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/api/songs/track/audio", nil)
		if header != "" {
			req.Header.Set(header, value)
		}
		rec := httptest.NewRecorder()
		serveAudioFile(rec, req, path)
		return rec
	}

	first := get("", "")
	etag := first.Header().Get("ETag")
	if first.Code != http.StatusOK || etag == "" {
		t.Fatalf("status = %d, ETag = %q", first.Code, etag)
	}
	if got := first.Header().Get("Cache-Control"); got != "private, no-cache" {
		t.Fatalf("Cache-Control = %q", got)
	}
	if rec := get("If-None-Match", etag); rec.Code != http.StatusNotModified || rec.Body.Len() != 0 {
		t.Fatalf("revalidation status = %d, body = %d bytes", rec.Code, rec.Body.Len())
	}
	if rec := get("Range", "bytes=2-4"); rec.Code != http.StatusPartialContent || rec.Body.String() != "234" {
		t.Fatalf("range status = %d, body = %q", rec.Code, rec.Body.String())
	}

	replacement := path + ".tmp"
	if err := os.WriteFile(replacement, []byte("new audio bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(replacement, path); err != nil {
		t.Fatal(err)
	}
	rec := get("If-None-Match", etag)
	if rec.Code != http.StatusOK || rec.Body.String() != "new audio bytes" || rec.Header().Get("ETag") == etag {
		t.Fatalf("after replacement status = %d, body = %q, ETag = %q", rec.Code, rec.Body.String(), rec.Header().Get("ETag"))
	}
}
