//go:build integration

package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"orpheus-web/internal/testutil"
	"orpheus-web/internal/types"
)

func TestCommitWorkflowReleaseDate(t *testing.T) {
	db, _, _ := testutil.Postgres(t)
	commit := func(t *testing.T, trackID, releaseDate string) {
		t.Helper()
		body, err := json.Marshal(types.CommitRequest{Items: []types.CommitItem{{
			Song:  types.MusicTrack{ID: trackID, Name: trackID, Artist: "Artist", Album: "Album", ReleaseDate: releaseDate},
			Video: types.YouTubeVideo{ID: "video-" + trackID, Title: "Video", ChannelTitle: "Channel", PublishedAt: "2024-01-01"},
		}}})
		if err != nil {
			t.Fatal(err)
		}
		response := httptest.NewRecorder()
		CommitWorkflow(db).ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/workflow/commit", strings.NewReader(string(body))))
		var result types.CommitResponse
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || len(result.Results) != 1 || !result.Results[0].Success {
			t.Fatalf("commit %s: %d %s", trackID, response.Code, response.Body)
		}
	}
	stored := func(t *testing.T, trackID string) (*time.Time, *int) {
		t.Helper()
		var date *time.Time
		var year *int
		if err := db.Pool.QueryRow(t.Context(), `SELECT release_date, release_year FROM songs WHERE id = $1`, trackID).Scan(&date, &year); err != nil {
			t.Fatal(err)
		}
		return date, year
	}

	t.Run("unknown date is stored as NULL", func(t *testing.T) {
		commit(t, "unknown", "")
		if date, year := stored(t, "unknown"); date != nil || year != nil {
			t.Fatalf("release_date=%v release_year=%v, want both NULL", date, year)
		}
	})
	t.Run("full date derives the year", func(t *testing.T) {
		commit(t, "dated", "2024-05-01")
		date, year := stored(t, "dated")
		if date == nil || !date.Equal(time.Date(2024, 5, 1, 0, 0, 0, 0, time.UTC)) || year == nil || *year != 2024 {
			t.Fatalf("release_date=%v release_year=%v", date, year)
		}
	})
	t.Run("year-only date derives the year", func(t *testing.T) {
		commit(t, "year-only", "2019")
		if _, year := stored(t, "year-only"); year == nil || *year != 2019 {
			t.Fatalf("release_year=%v, want 2019", year)
		}
	})
}
