package services

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

type youtubeTestTransport struct{ handler http.Handler }

func (t youtubeTestTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	w := httptest.NewRecorder()
	t.handler.ServeHTTP(w, r)
	return w.Result(), nil
}

func TestDiscoveryPreservesSearchRelevanceForRememberedLyrics(t *testing.T) {
	client := NewYouTubeClient("test-key", &http.Client{Transport: youtubeTestTransport{handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/youtube/v3/search" {
			if r.URL.Query().Get("q") != "sia bulletproof" {
				t.Errorf("unexpected query: %s", r.URL.Query().Get("q"))
			}
			if r.URL.Query().Get("videoEmbeddable") != "true" {
				t.Error("search must require embeddable videos")
			}
			fmt.Fprint(w, `{"items":[{"id":{"videoId":"titanium"},"snippet":{"title":"David Guetta - Titanium ft. Sia","channelTitle":"David Guetta"}},{"id":{"videoId":"literal"},"snippet":{"title":"Sia - Bulletproof Official Music Video Audio","channelTitle":"Music"}}]}`)
			return
		}
		fmt.Fprint(w, `{"items":[{"id":"titanium","contentDetails":{"duration":"PT4M5S"}},{"id":"literal","contentDetails":{"duration":"PT4M5S"}}]}`)
	})}})
	results, err := client.DiscoverVideos(context.Background(), "sia bulletproof")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 2 || results[0].ID != "titanium" {
		t.Fatalf("search relevance lost: %+v", results)
	}
	if results[0].Confidence >= results[1].Confidence {
		t.Fatal("fixture must give later literal title higher music likelihood")
	}
}
