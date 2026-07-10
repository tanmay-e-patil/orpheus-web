package handlers

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"orpheus-web/internal/services"
	"orpheus-web/internal/store"
	"orpheus-web/internal/types"
)

func GetSong(db *store.Store, userIDFromContext func(context.Context) (string, bool)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := userIDFromContext(r.Context())
		if !ok {
			Error(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
			return
		}
		trackID := r.PathValue("trackId")
		if trackID == "" {
			Error(w, http.StatusBadRequest, "track_required", "trackId required")
			return
		}
		song, source, err := db.FetchLibrarySong(r.Context(), userID, trackID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				Error(w, http.StatusNotFound, "not_found", "Song not found")
				return
			}
			slog.ErrorContext(r.Context(), "song fetch failed", "component", "api", "track_id", trackID, "error", err)
			Error(w, http.StatusInternalServerError, "song_failed", "Could not fetch song")
			return
		}
		JSON(w, http.StatusOK, map[string]any{"song": song, "audioSource": source})
	}
}

func UpdateSongMetadata(db *store.Store, queue *services.QueuePublisher, userIDFromContext func(context.Context) (string, bool)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := userIDFromContext(r.Context())
		if !ok {
			Error(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
			return
		}
		var body struct {
			Name        string `json:"name"`
			ArtistName  string `json:"artistName"`
			AlbumName   string `json:"albumName"`
			AlbumArt    string `json:"albumArt"`
			ReleaseDate string `json:"releaseDate"`
		}
		if err := DecodeJSON(r, &body); err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "Invalid metadata request")
			return
		}
		if strings.TrimSpace(body.Name) == "" || strings.TrimSpace(body.ArtistName) == "" || strings.TrimSpace(body.AlbumName) == "" {
			Error(w, http.StatusBadRequest, "missing_fields", "Name, artist, and album are required")
			return
		}
		resp, err := db.UpdateSongMetadata(r.Context(), userID, r.PathValue("trackId"), store.SongMetadataUpdate{
			Name: strings.TrimSpace(body.Name), ArtistName: strings.TrimSpace(body.ArtistName), AlbumName: strings.TrimSpace(body.AlbumName), AlbumArt: body.AlbumArt, ReleaseDate: body.ReleaseDate,
		}, queue.Enabled(), queue.PublishProcessSong)
		writeSongEditResponse(r.Context(), w, resp, err)
	}
}

func ReplaceAudioSource(db *store.Store, queue *services.QueuePublisher, userIDFromContext func(context.Context) (string, bool)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := userIDFromContext(r.Context())
		if !ok {
			Error(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
			return
		}
		var video types.YouTubeVideo
		if err := DecodeJSON(r, &video); err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "Invalid audio source request")
			return
		}
		if video.ID == "" || video.Title == "" {
			Error(w, http.StatusBadRequest, "missing_fields", "Video id and title are required")
			return
		}
		resp, err := db.ReplaceAudioSource(r.Context(), userID, r.PathValue("trackId"), video, queue.Enabled(), queue.PublishProcessSong)
		writeSongEditResponse(r.Context(), w, resp, err)
	}
}

func RegenerateSong(db *store.Store, queue *services.QueuePublisher, userIDFromContext func(context.Context) (string, bool)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := userIDFromContext(r.Context())
		if !ok {
			Error(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
			return
		}
		resp, err := db.RegenerateSong(r.Context(), userID, r.PathValue("trackId"), queue.Enabled(), queue.PublishProcessSong)
		writeSongEditResponse(r.Context(), w, resp, err)
	}
}

func writeSongEditResponse(ctx context.Context, w http.ResponseWriter, resp store.SongEditResponse, err error) {
	if err != nil {
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			Error(w, http.StatusNotFound, "not_found", "Song not found")
		case errors.Is(err, store.ErrBadReleaseDate):
			Error(w, http.StatusBadRequest, "bad_release_date", "Release date must be empty, YYYY, or YYYY-MM-DD")
		case errors.Is(err, store.ErrSameAudioSource):
			Error(w, http.StatusConflict, "same_audio_source", "Audio source is already selected")
		case errors.Is(err, store.ErrNoAudioSource):
			Error(w, http.StatusConflict, "no_audio_source", "Song has no audio source")
		default:
			slog.ErrorContext(ctx, "song edit failed", "component", "api", "error", err)
			Error(w, http.StatusInternalServerError, "song_edit_failed", "Could not update song")
		}
		return
	}
	JSON(w, http.StatusOK, resp)
}
