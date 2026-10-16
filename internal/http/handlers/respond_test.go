package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"orpheus-web/internal/types"
)

func TestDecodeJSONMatchTracksAllowsYouTubeVideoFields(t *testing.T) {
	body := `{"searchQuery":"Atif Aslam Dil Diyan Gallan","videos":[{"id":"abc123","title":"Track Title","thumbnail":"https://example.test/thumb.jpg","channelTitle":"Artist","publishedAt":"2026-01-02T03:04:05Z","duration":"PT3M10S","viewCount":"12345"}]}`
	req := httptest.NewRequest(http.MethodPost, "/api/discover/deezer/matches", strings.NewReader(body))

	var decoded types.MatchTracksRequest
	if err := DecodeJSON(req, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.SearchQuery != "Atif Aslam Dil Diyan Gallan" {
		t.Fatalf("search query = %q", decoded.SearchQuery)
	}
	if len(decoded.Videos) != 1 {
		t.Fatalf("decoded %d videos, want 1", len(decoded.Videos))
	}
	if decoded.Videos[0].ID != "abc123" {
		t.Fatalf("video id = %q, want abc123", decoded.Videos[0].ID)
	}
}

func TestDecodeJSONMatchTracksRejectsDiscoveryOnlyFields(t *testing.T) {
	body := `{"videos":[{"id":"abc123","title":"Track Title","thumbnail":"https://example.test/thumb.jpg","channelTitle":"Artist","publishedAt":"2026-01-02T03:04:05Z","duration":"PT3M10S","viewCount":"12345","confidence":92,"musicProbability":0.9,"selected":true}]}`
	req := httptest.NewRequest(http.MethodPost, "/api/discover/deezer/matches", strings.NewReader(body))

	var decoded types.MatchTracksRequest
	if err := DecodeJSON(req, &decoded); err == nil {
		t.Fatal("expected discovery-only fields to be rejected")
	}
}
