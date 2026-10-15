package handlers

import (
	"errors"
	"net/http"

	"orpheus-web/internal/services"
	"orpheus-web/internal/types"
)

func DiscoverYouTube(youtube *services.YouTubeClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body types.DiscoverYouTubeRequest
		if err := DecodeJSON(r, &body); err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "Invalid YouTube discovery request")
			return
		}
		if body.Query == "" {
			Error(w, http.StatusBadRequest, "query_required", "query required")
			return
		}
		results, err := youtube.DiscoverVideos(r.Context(), body.Query)
		if err != nil {
			if errors.Is(err, services.ErrRateLimited) {
				Error(w, http.StatusTooManyRequests, "rate_limited", "YouTube rate limited the request")
				return
			}
			Error(w, http.StatusBadGateway, "youtube_failed", err.Error())
			return
		}
		JSON(w, http.StatusOK, results)
	}
}

func MatchDeezerTracks(deezer *services.DeezerClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body types.MatchTracksRequest
		if err := DecodeJSON(r, &body); err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "Invalid track matching request")
			return
		}
		results, err := deezer.FindTrackMatches(r.Context(), body.Videos, body.SearchQuery)
		if err != nil {
			Error(w, http.StatusBadGateway, "deezer_failed", "Could not find track matches")
			return
		}
		JSON(w, http.StatusOK, results)
	}
}

func CustomDeezerMatch(deezer *services.DeezerClient) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body types.CustomTrackMatchRequest
		if err := DecodeJSON(r, &body); err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "Invalid custom match request")
			return
		}
		if body.CustomQuery == "" {
			Error(w, http.StatusBadRequest, "query_required", "customQuery required")
			return
		}
		result, err := deezer.SearchTrackWithCustomQuery(r.Context(), body.Video, body.CustomQuery)
		if err != nil {
			Error(w, http.StatusBadGateway, "deezer_failed", "Could not search Deezer")
			return
		}
		JSON(w, http.StatusOK, result)
	}
}
