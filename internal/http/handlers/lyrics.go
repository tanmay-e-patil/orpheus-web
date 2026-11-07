package handlers

import (
	"errors"
	"net/http"

	"orpheus-web/internal/services"
	"orpheus-web/internal/types"
)

func LRCLibExact(lrclib *services.LRCLibClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body types.LRCLibExactRequest
		if err := DecodeJSON(r, &body); err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "Invalid LRCLIB request")
			return
		}
		duration := 0
		if body.DurationSec != nil {
			duration = *body.DurationSec
		} else if body.ISODuration != "" {
			duration = services.ParseISODurationSeconds(body.ISODuration)
		}
		if body.TrackName == "" || body.ArtistName == "" || body.AlbumName == "" || duration == 0 {
			Error(w, http.StatusBadRequest, "missing_fields", "Missing required fields")
			return
		}
		payload, status, err := lrclib.GetExact(r.Context(), body.TrackName, body.ArtistName, body.AlbumName, duration)
		if err != nil {
			Error(w, http.StatusBadGateway, "lrclib_failed", err.Error())
			return
		}
		JSON(w, status, payload)
	}
}

func LyricsOptions(lrclib *services.LRCLibClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body types.LyricsOptionsRequest
		if err := DecodeJSON(r, &body); err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "Invalid lyrics options request")
			return
		}
		result, err := lrclib.FetchLyricsOptions(r.Context(), body.Track)
		if err != nil {
			lyricsSearchError(w, err, "lyrics_options_failed", "Could not fetch lyrics options")
			return
		}
		JSON(w, http.StatusOK, result)
	}
}

func CustomLyricsSearch(lrclib *services.LRCLibClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body types.CustomLyricsSearchRequest
		if err := DecodeJSON(r, &body); err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "Invalid custom lyrics request")
			return
		}
		if body.CustomQuery == "" {
			Error(w, http.StatusBadRequest, "query_required", "customQuery required")
			return
		}
		result, err := lrclib.SearchLyricsWithCustomQuery(r.Context(), body.Track, body.CustomQuery)
		if err != nil {
			lyricsSearchError(w, err, "lyrics_search_failed", "Could not search lyrics")
			return
		}
		JSON(w, http.StatusOK, result)
	}
}

func lyricsSearchError(w http.ResponseWriter, err error, code, message string) {
	if errors.Is(err, services.ErrLyricsUnavailable) {
		Error(w, http.StatusServiceUnavailable, "lyrics_unavailable", "Lyrics service is temporarily unavailable. Try again or continue without lyrics.")
		return
	}
	Error(w, http.StatusBadGateway, code, message)
}
