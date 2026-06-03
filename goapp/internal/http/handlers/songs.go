package handlers

import (
	"context"
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"

	"orpheus-goapp/internal/services"
	"orpheus-goapp/internal/store"
	"orpheus-goapp/internal/types"
)

func GetSongs(db *store.Store, userIDFromContext func(context.Context) (string, bool)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := userIDFromContext(r.Context())
		if !ok {
			Error(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
			return
		}
		params := r.URL.Query()
		var cursor *types.SongCursor
		if params.Get("artistName") != "" && params.Get("trackId") != "" {
			cursor = &types.SongCursor{ArtistName: params.Get("artistName"), TrackID: params.Get("trackId")}
			if raw := params.Get("playCount"); raw != "" {
				parsed, err := strconv.Atoi(raw)
				if err != nil {
					Error(w, http.StatusBadRequest, "bad_cursor", "Invalid cursor")
					return
				}
				cursor.PlayCount = parsed
			}
		}
		limit := 50
		if raw := params.Get("limit"); raw != "" {
			parsed, err := strconv.Atoi(raw)
			if err != nil {
				Error(w, http.StatusBadRequest, "bad_limit", "Invalid limit")
				return
			}
			limit = parsed
		}
		sort := store.SongSortArtist
		if params.Get("sort") == string(store.SongSortMostPlayed) {
			sort = store.SongSortMostPlayed
		}
		page, err := db.FetchSongsPage(r.Context(), store.FetchSongsOptions{UserID: userID, Cursor: cursor, Limit: limit, Sort: sort})
		if err != nil {
			log.Printf("api songs fetch failed cursor=%+v limit=%d error=%v", cursor, limit, err)
			Error(w, http.StatusInternalServerError, "songs_failed", "Could not fetch songs")
			return
		}
		JSON(w, http.StatusOK, page)
	}
}

func RecordSongPlay(db *store.Store, userIDFromContext func(context.Context) (string, bool)) http.HandlerFunc {
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
		play, err := db.RecordSongPlay(r.Context(), userID, trackID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				Error(w, http.StatusNotFound, "not_found", "Song not found")
				return
			}
			if errors.Is(err, store.ErrSongUnavailable) {
				Error(w, http.StatusConflict, "unavailable", "Song unavailable")
				return
			}
			log.Printf("api song play record failed track_id=%q error=%v", trackID, err)
			Error(w, http.StatusInternalServerError, "play_record_failed", "Could not record play")
			return
		}
		JSON(w, http.StatusOK, play)
	}
}

func RefreshAlbumArt(db *store.Store, deezer *services.DeezerClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body types.RefreshAlbumArtRequest
		if err := DecodeJSON(r, &body); err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "Invalid album art refresh request")
			return
		}
		updated, err := deezer.RefreshAlbumArt(r.Context(), db, body.TrackIDs)
		if err != nil {
			log.Printf("api album art refresh failed track_count=%d error=%v", len(body.TrackIDs), err)
			Error(w, http.StatusInternalServerError, "album_art_failed", "Could not refresh album art")
			return
		}
		JSON(w, http.StatusOK, types.RefreshAlbumArtResponse{Updated: updated})
	}
}

func SaveLyrics(db *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body types.SaveLyricsRequest
		if err := DecodeJSON(r, &body); err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "Invalid lyrics save request")
			return
		}
		trackID := body.TrackID
		if trackID == "" {
			trackID = body.SpotifyID
		}
		if trackID == "" {
			Error(w, http.StatusBadRequest, "track_required", "trackId required")
			return
		}
		if err := db.UpdateLyrics(r.Context(), trackID, body.PlainLyrics, body.SyncedLyrics); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				Error(w, http.StatusNotFound, "not_found", "Song not found")
				return
			}
			log.Printf("api lyrics save failed track_id=%q error=%v", trackID, err)
			Error(w, http.StatusInternalServerError, "lyrics_save_failed", "Could not save lyrics")
			return
		}
		JSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}
