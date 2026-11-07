package services

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"orpheus-web/internal/types"
)

type deezerGraphQLTransport struct{ handler http.Handler }

func (t deezerGraphQLTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	w := httptest.NewRecorder()
	t.handler.ServeHTTP(w, r)
	return w.Result(), nil
}

func anonymousTestJWT() string {
	return "header." + base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(`{"exp":%d}`, time.Now().Add(5*time.Minute).Unix()))) + ".signature"
}

func TestDeezerGraphQLFindsWebsiteRecordingAndCachesAnonymousAuth(t *testing.T) {
	fixture, err := os.ReadFile("testdata/deezer_search_full_firework.json")
	if err != nil {
		t.Fatal(err)
	}
	authCalls, searchCalls := 0, 0
	client := NewDeezerClient(&http.Client{Transport: deezerGraphQLTransport{handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Host {
		case "auth.deezer.com":
			authCalls++
			json.NewEncoder(w).Encode(map[string]string{"jwt": anonymousTestJWT()})
		case "pipe.deezer.com":
			searchCalls++
			if r.Method != http.MethodPost || !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
				t.Error("missing authorized POST")
			}
			var body struct {
				OperationName string `json:"operationName"`
				Variables     struct {
					Query string `json:"query"`
				} `json:"variables"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
			if body.OperationName != "SearchFull" || body.Variables.Query != "katy perry fireworks" {
				t.Errorf("unexpected GraphQL request: %+v", body)
			}
			w.Write(fixture)
		default:
			t.Errorf("unexpected REST request: %s", r.URL.Path)
			w.WriteHeader(503)
		}
	})}})
	duration := "PT3M49S"
	for range 2 {
		results, err := client.FindTrackMatches(context.Background(), []types.YouTubeVideo{{Title: "Katy Perry - Firework HQ (Audio)", Duration: &duration}}, "katy perry fireworks")
		if err != nil {
			t.Fatal(err)
		}
		result := results[0]
		if !result.AutoAccept || result.SelectedMatch == nil {
			t.Fatalf("recording not accepted: %+v", result)
		}
		track := result.SelectedMatch
		if track.ID != "6812361" || track.Artist != "Katy Perry" || track.DurationMs == nil || *track.DurationMs != 228000 || track.Album != "Teenage Dream" || track.AlbumImageURL == "" || track.ReleaseDate != "2010-08-27" {
			t.Fatalf("incorrect metadata: %+v", track)
		}
		if track.Popularity == nil || *track.Popularity != 8.17808 {
			t.Fatalf("popularity was not preserved: %+v", track)
		}
		if len(result.TrackMatches) != 2 {
			t.Fatalf("best result was not deduplicated: %+v", result.TrackMatches)
		}
	}
	if authCalls != 1 || searchCalls != 2 {
		t.Fatalf("auth=%d searches=%d", authCalls, searchCalls)
	}
}

func TestDeezerGraphQLRefreshesRejectedAnonymousToken(t *testing.T) {
	fixture, err := os.ReadFile("testdata/deezer_search_full_firework.json")
	if err != nil {
		t.Fatal(err)
	}
	authCalls, searchCalls := 0, 0
	client := NewDeezerClient(&http.Client{Transport: deezerGraphQLTransport{handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Host == "auth.deezer.com" {
			authCalls++
			json.NewEncoder(w).Encode(map[string]string{"jwt": anonymousTestJWT()})
			return
		}
		if r.URL.Host != "pipe.deezer.com" {
			t.Errorf("unexpected REST fallback: %s", r.URL.Path)
			w.WriteHeader(503)
			return
		}
		searchCalls++
		if searchCalls == 1 {
			fmt.Fprint(w, `{"errors":[{"type":"JwtTokenExpiredError"}],"data":{"instantSearch":null}}`)
			return
		}
		w.Write(fixture)
	})}})
	result, err := client.SearchTrackWithCustomQuery(context.Background(), types.YouTubeVideo{Title: "Katy Perry - Firework"}, "katy perry fireworks")
	if err != nil {
		t.Fatal(err)
	}
	if authCalls != 2 || searchCalls != 2 || len(result.TrackMatches) != 2 {
		t.Fatalf("auth=%d searches=%d result=%+v", authCalls, searchCalls, result)
	}
}

func TestDeezerGraphQLFailuresFallBackToREST(t *testing.T) {
	for _, test := range []struct {
		name   string
		status int
		body   string
	}{
		{"HTTP failure", 503, `{}`},
		{"GraphQL error with HTTP 200", 200, `{"errors":[{"type":"InternalError"}],"data":{"instantSearch":null}}`},
		{"missing data", 200, `{}`},
		{"no tracks", 200, `{"data":{"instantSearch":{"bestResult":{},"results":{"tracks":{"edges":[]}}}}}`},
		{"malformed response", 200, `invalid json`},
	} {
		t.Run(test.name, func(t *testing.T) {
			restCalls := 0
			client := NewDeezerClient(&http.Client{Transport: deezerGraphQLTransport{handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Host {
				case "auth.deezer.com":
					json.NewEncoder(w).Encode(map[string]string{"jwt": anonymousTestJWT()})
				case "pipe.deezer.com":
					w.WriteHeader(test.status)
					fmt.Fprint(w, test.body)
				default:
					if strings.HasPrefix(r.URL.Path, "/track/") {
						fmt.Fprint(w, `{"release_date":"2012-03-23"}`)
						return
					}
					restCalls++
					fmt.Fprint(w, `{"data":[{"id":17135111,"title":"Firework","duration":228,"artist":{"name":"Katy Perry"}}]}`)
				}
			})}})
			duration := "PT3M49S"
			result, err := client.SearchTrackWithCustomQuery(context.Background(), types.YouTubeVideo{Title: "Katy Perry - Firework", Duration: &duration}, "katy perry firework")
			if err != nil {
				t.Fatal(err)
			}
			if restCalls != 1 || result.SelectedMatch == nil || result.SelectedMatch.ID != "17135111" {
				t.Fatalf("fallback calls=%d result=%+v", restCalls, result)
			}
		})
	}
}

func TestDeezerGraphQLBoundsRejectedTokenRetries(t *testing.T) {
	authCalls, searchCalls, restCalls := 0, 0, 0
	client := NewDeezerClient(&http.Client{Transport: deezerGraphQLTransport{handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Host {
		case "auth.deezer.com":
			authCalls++
			json.NewEncoder(w).Encode(map[string]string{"jwt": anonymousTestJWT()})
		case "pipe.deezer.com":
			searchCalls++
			w.WriteHeader(http.StatusUnauthorized)
		default:
			restCalls++
			fmt.Fprint(w, `{"data":[]}`)
		}
	})}})
	for range 2 {
		if _, err := client.SearchTrackWithCustomQuery(context.Background(), types.YouTubeVideo{Title: "Song"}, "Song"); err != nil {
			t.Fatal(err)
		}
	}
	if authCalls != 2 || searchCalls != 2 || restCalls != 2 {
		t.Fatalf("unbounded retry/backoff: auth=%d search=%d rest=%d", authCalls, searchCalls, restCalls)
	}
}
