package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	promtest "github.com/prometheus/client_golang/prometheus/testutil"

	"orpheus-web/internal/metrics"
)

func TestRecordPlaybackStart(t *testing.T) {
	post := func(body string) int {
		req := httptest.NewRequest(http.MethodPost, "/api/metrics/playback-start", strings.NewReader(body))
		rec := httptest.NewRecorder()
		RecordPlaybackStart(rec, req)
		return rec.Code
	}
	before := promtest.CollectAndCount(metrics.PlaybackStartDuration)
	if code := post(`{"seconds":0.42,"trigger":"manual","prefetched":false}`); code != http.StatusNoContent {
		t.Fatalf("valid report status = %d", code)
	}
	if code := post(`{"seconds":0.1,"trigger":"auto","prefetched":true}`); code != http.StatusNoContent {
		t.Fatalf("valid auto report status = %d", code)
	}
	if got := promtest.CollectAndCount(metrics.PlaybackStartDuration); got != before+2 {
		t.Fatalf("series = %d, want %d", got, before+2)
	}
	for _, body := range []string{
		`{"seconds":0,"trigger":"manual"}`,
		`{"seconds":-1,"trigger":"manual"}`,
		`{"seconds":61,"trigger":"manual"}`,
		`{"seconds":1,"trigger":"evil-label"}`,
		`{"seconds":1,"trigger":"manual","extra":1}`,
		`not json`,
		`{"seconds":1,"trigger":"` + strings.Repeat("x", 2000) + `"}`,
	} {
		if code := post(body); code != http.StatusBadRequest {
			t.Errorf("%.40s: status = %d, want 400", body, code)
		}
	}
	if got := promtest.CollectAndCount(metrics.PlaybackStartDuration); got != before+2 {
		t.Fatalf("invalid reports created series: %d", got)
	}
}
