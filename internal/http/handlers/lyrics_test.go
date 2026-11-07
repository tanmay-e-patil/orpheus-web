package handlers

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"orpheus-web/internal/services"
)

type lyricsFailureTransport struct{ status int }

func (t lyricsFailureTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	return &http.Response{StatusCode: t.status, Status: http.StatusText(t.status), Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"name":"ServerOverloaded"}`)), Request: r}, nil
}

func TestLyricsHandlersReportTemporaryUnavailability(t *testing.T) {
	for _, status := range []int{http.StatusServiceUnavailable, http.StatusTooManyRequests} {
		client := services.NewLRCLibClient(&http.Client{Transport: lyricsFailureTransport{status: status}})
		for name, handler := range map[string]http.HandlerFunc{"options": LyricsOptions(client), "custom": CustomLyricsSearch(client)} {
			t.Run(http.StatusText(status)+"/"+name, func(t *testing.T) {
				body := `{"track":{"id":"1","name":"Home","artist":"AURORA","album":"Album"}}`
				if name == "custom" {
					body = `{"track":{"id":"1","name":"Home","artist":"AURORA","album":"Album"},"customQuery":"aurora home"}`
				}
				req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
				w := httptest.NewRecorder()
				handler(w, req)
				if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), `"code":"lyrics_unavailable"`) || !strings.Contains(w.Body.String(), "continue without lyrics") {
					t.Fatalf("response=%d %s", w.Code, w.Body.String())
				}
			})
		}
	}
}
