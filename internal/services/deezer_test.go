package services

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"orpheus-web/internal/types"
)

type deezerTestTransport struct{ handler http.Handler }

func (t deezerTestTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	w := httptest.NewRecorder()
	// Existing REST fixtures exercise fallback when the website API is unavailable.
	if r.URL.Host == "auth.deezer.com" {
		w.WriteHeader(http.StatusServiceUnavailable)
		return w.Result(), nil
	}
	t.handler.ServeHTTP(w, r)
	return w.Result(), nil
}

func TestDiscoverQueryMatchesNoisyAudioSource(t *testing.T) {
	for _, query := range []string{"Dil Diyan Gallan", "Dil Diyan Gallan Atif Aslam", "Atif Aslam Dil Diyan Gallan"} {
		t.Run(query, func(t *testing.T) {
			searches := 0
			client := NewDeezerClient(&http.Client{Transport: deezerTestTransport{handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				if r.URL.Path == "/track/1" {
					fmt.Fprint(w, `{"release_date":"2017-12-22"}`)
					return
				}
				searches++
				if got := r.URL.Query().Get("q"); searches == 1 && got != query {
					t.Errorf("query = %q, want %q", got, query)
				}
				fmt.Fprint(w, `{"data":[{"id":1,"title":"Dil Diyan Gallan","duration":260,"artist":{"name":"Atif Aslam"}}]}`)
			})}})
			video := types.YouTubeVideo{Title: "Lyrical | Dil Diyan Gallan Song with Lyrics | Tiger Zinda Hai | Vishal and Shekhar | Irshad Kamil"}
			results, err := client.FindTrackMatches(context.Background(), []types.YouTubeVideo{video}, query)
			if err != nil {
				t.Fatal(err)
			}
			if searches < 2 || searches > 4 {
				t.Errorf("searches = %d, want bounded fallback searches", searches)
			}
			if len(results) != 1 || len(results[0].TrackMatches) != 1 {
				t.Fatalf("correct candidate missing: %+v", results)
			}
			if results[0].SelectedMatch != nil {
				t.Fatal("low-confidence candidate must require manual selection")
			}
		})
	}
}

func TestCustomSearchKeepsLowScoringCandidates(t *testing.T) {
	client := NewDeezerClient(&http.Client{Transport: deezerTestTransport{handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/track/1" {
			fmt.Fprint(w, `{}`)
			return
		}
		fmt.Fprint(w, `{"data":[{"id":1,"title":"Dil Diyan Gallan","artist":{"name":"Atif Aslam"}}]}`)
	})}})
	result, err := client.SearchTrackWithCustomQuery(context.Background(), types.YouTubeVideo{Title: "Unrelated upload title"}, "Dil Diyan Gallan")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.TrackMatches) != 1 {
		t.Fatal("custom search discarded candidate")
	}
	if result.SelectedMatch != nil {
		t.Fatal("low-confidence candidate auto-selected")
	}
}

func TestHighConfidenceMatchIsSelected(t *testing.T) {
	client := NewDeezerClient(&http.Client{Transport: deezerTestTransport{handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/track/1" {
			fmt.Fprint(w, `{}`)
			return
		}
		fmt.Fprint(w, `{"data":[{"id":1,"title":"Dil Diyan Gallan","duration":260,"artist":{"name":"Atif Aslam"}}]}`)
	})}})
	duration := "PT4M20S"
	result, err := client.SearchTrackWithCustomQuery(context.Background(), types.YouTubeVideo{Title: "Dil Diyan Gallan Atif Aslam", Duration: &duration}, "Dil Diyan Gallan")
	if err != nil {
		t.Fatal(err)
	}
	if result.Confidence != "high" || result.SelectedMatch == nil {
		t.Fatalf("expected selected high-confidence match: %+v", result)
	}
}
