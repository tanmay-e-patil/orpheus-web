package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5"

	"orpheus-goapp/internal/store"
	"orpheus-goapp/internal/types"
)

func StreamSongAudio(db *store.Store, libraryPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		trackID := strings.TrimSpace(r.PathValue("trackId"))
		if trackID == "" {
			Error(w, http.StatusBadRequest, "track_required", "trackId required")
			return
		}
		song, err := db.SongForAudio(r.Context(), trackID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				Error(w, http.StatusNotFound, "not_found", "Song not found")
				return
			}
			Error(w, http.StatusInternalServerError, "audio_lookup_failed", "Could not fetch song")
			return
		}
		if !song.IsAvailable {
			Error(w, http.StatusNotFound, "song_unavailable", "Song is not available")
			return
		}
		path, err := LibraryAudioPath(libraryPath, song)
		if err != nil {
			Error(w, http.StatusNotFound, "audio_missing", "Audio file missing")
			return
		}
		file, err := os.Open(path)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				Error(w, http.StatusNotFound, "audio_missing", "Audio file missing")
				return
			}
			Error(w, http.StatusInternalServerError, "audio_open_failed", "Could not open audio file")
			return
		}
		defer file.Close()
		info, err := file.Stat()
		if err != nil || info.IsDir() {
			Error(w, http.StatusNotFound, "audio_missing", "Audio file missing")
			return
		}
		w.Header().Set("Content-Type", "audio/mp4")
		w.Header().Set("Accept-Ranges", "bytes")
		w.Header().Set("Cache-Control", "private, max-age=3600")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		http.ServeContent(w, r, filepath.Base(path), song.UpdatedAt, file)
	}
}

func LibraryAudioPath(baseDir string, song types.AudioSong) (string, error) {
	baseDir = strings.TrimSpace(baseDir)
	if baseDir == "" {
		return "", errors.New("library path is empty")
	}
	if strings.TrimSpace(song.ArtistName) == "" || strings.TrimSpace(song.AlbumName) == "" || strings.TrimSpace(song.Name) == "" {
		return "", errors.New("song path fields are required")
	}
	for _, component := range []string{song.ArtistName, song.AlbumName, song.Name} {
		if hasUnsafePathSegment(component) {
			return "", errors.New("song path field is unsafe")
		}
	}
	baseAbs, err := filepath.Abs(baseDir)
	if err != nil {
		return "", fmt.Errorf("resolve library path: %w", err)
	}
	fullAbs, err := filepath.Abs(filepath.Join(baseAbs, song.ArtistName, song.AlbumName, song.Name+".m4a"))
	if err != nil {
		return "", fmt.Errorf("resolve audio path: %w", err)
	}
	rel, err := filepath.Rel(baseAbs, fullAbs)
	if err != nil {
		return "", fmt.Errorf("validate audio path: %w", err)
	}
	if rel == "." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || rel == ".." || filepath.IsAbs(rel) {
		return "", errors.New("audio path escapes library")
	}
	return fullAbs, nil
}

func hasUnsafePathSegment(value string) bool {
	if filepath.IsAbs(value) {
		return true
	}
	for _, segment := range strings.FieldsFunc(value, func(r rune) bool {
		return r == '/' || r == '\\'
	}) {
		if segment == ".." {
			return true
		}
	}
	return false
}
