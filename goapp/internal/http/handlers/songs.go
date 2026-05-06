package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"

	"orpheus-goapp/internal/services"
	"orpheus-goapp/internal/store"
	"orpheus-goapp/internal/types"
)

func GetSongs(db *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		params := r.URL.Query()
		var cursor *types.SongCursor
		if params.Get("artistName") != "" && params.Get("trackId") != "" {
			cursor = &types.SongCursor{ArtistName: params.Get("artistName"), TrackID: params.Get("trackId")}
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
		page, err := db.FetchSongsPage(r.Context(), cursor, limit)
		if err != nil {
			Error(w, http.StatusInternalServerError, "songs_failed", "Could not fetch songs")
			return
		}
		JSON(w, http.StatusOK, page)
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
			Error(w, http.StatusInternalServerError, "lyrics_save_failed", "Could not save lyrics")
			return
		}
		JSON(w, http.StatusOK, map[string]bool{"ok": true})
	}
}
