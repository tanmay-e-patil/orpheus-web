package services

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"slices"
	"strings"
	"testing"

	"orpheus-web/internal/types"
)

func candidate(title, artist string, duration int) deezerTrack {
	t := deezerTrack{Title: title, Duration: duration}
	t.Artist.Name = artist
	return t
}

func rankedCandidate(video types.YouTubeVideo, track deezerTrack, id string) types.MusicTrack {
	m := track.toMusicTrack()
	m.ID = id
	m.MatchScore, m.MatchEvidence = scoreTrackMatch(video, track)
	return m
}

func TestTrackEvidenceFixtures(t *testing.T) {
	duration := "PT4M20S"
	fixtures := []struct {
		name, title, channel, track, artist string
		duration                            *string
		seconds                             int
		accept                              bool
		conflict                            bool
	}{
		{"artist first", "Atif Aslam - Dil Diyan Gallan (Official Video)", "", "Dil Diyan Gallan", "Atif Aslam", &duration, 260, true, false},
		{"noisy credits with artist channel", "Lyrical | Dil Diyan Gallan Song with Lyrics | Tiger Zinda Hai | Vishal and Shekhar", "Atif Aslam - Topic", "Dil Diyan Gallan", "Atif Aslam", &duration, 260, true, false},
		{"artist without separator and artist channel", "Atif Aslam Dil Diyan Gallan", "Atif Aslam", "Dil Diyan Gallan", "Atif Aslam", &duration, 260, true, false},
		{"missing artist", "Dil Diyan Gallan Song with Lyrics | Tiger Zinda Hai", "YRF", "Dil Diyan Gallan", "Atif Aslam", &duration, 260, false, false},
		{"missing duration", "Atif Aslam - Dil Diyan Gallan", "", "Dil Diyan Gallan", "Atif Aslam", nil, 260, false, false},
		{"live conflict", "Atif Aslam - Dil Diyan Gallan (Live)", "", "Dil Diyan Gallan", "Atif Aslam", &duration, 260, false, true},
		{"remix conflict", "Atif Aslam - Dil Diyan Gallan Remix", "", "Dil Diyan Gallan", "Atif Aslam", &duration, 260, false, true},
		{"cover conflict", "Atif Aslam - Dil Diyan Gallan Cover", "", "Dil Diyan Gallan", "Atif Aslam", &duration, 260, false, true},
		{"different duration", "Atif Aslam - Dil Diyan Gallan", "", "Dil Diyan Gallan", "Atif Aslam", &duration, 200, false, false},
		{"title substring is insufficient", "Artist - Hello Goodbye", "", "Hello", "Artist", &duration, 260, false, false},
		{"artist name alone is insufficient", "Song", "", "Song", "Song", &duration, 260, false, false},
		{"whole artist tokens", "Chair - Song", "Chair Topic", "Song", "Air", &duration, 260, false, false},
		{"html entities", "Earth, Wind &amp; Fire - September (Official Audio)", "", "September", "Earth, Wind & Fire", &duration, 260, true, false},
		{"unicode identity", "गायक - गीत (Official Audio)", "", "गीत", "गायक", &duration, 260, true, false},
	}
	for _, f := range fixtures {
		t.Run(f.name, func(t *testing.T) {
			video := types.YouTubeVideo{Title: f.title, ChannelTitle: f.channel, Duration: f.duration}
			m := rankedCandidate(video, candidate(f.track, f.artist, f.seconds), "1")
			accept, reasons := trackDecision([]types.MusicTrack{m})
			if accept != f.accept || m.MatchEvidence.VersionConflict != f.conflict {
				t.Fatalf("accept=%v score=%d evidence=%+v reasons=%v", accept, m.MatchScore, m.MatchEvidence, reasons)
			}
		})
	}
}

func TestTrackDecisionCompetingRecordings(t *testing.T) {
	d := "PT4M20S"
	video := types.YouTubeVideo{Title: "Artist - Song", Duration: &d}
	top := rankedCandidate(video, candidate("Song", "Artist", 260), "1")
	duplicate := rankedCandidate(video, candidate("Song", "Artist", 261), "2")
	if ok, _ := trackDecision([]types.MusicTrack{top, duplicate}); !ok {
		t.Fatal("equivalent album/single releases blocked acceptance")
	}
	competing := rankedCandidate(video, candidate("Song", "Artist", 265), "3")
	if ok, _ := trackDecision([]types.MusicTrack{top, competing}); ok {
		t.Fatal("distinct near-tied recording was automatically accepted")
	}
}

func TestUnicodeSimilarityUsesRunes(t *testing.T) {
	if got := StringSimilarity("你我", "你他"); math.Abs(got-.5) > .001 {
		t.Fatalf("similarity=%v, want .5", got)
	}
}

func TestTrackSearchUsesFallbackAndStopsOnStrongEvidence(t *testing.T) {
	d := "PT4M20S"
	var queries []string
	client := NewDeezerClient(&http.Client{Transport: deezerTestTransport{handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/track/") {
			fmt.Fprint(w, `{"release_date":"2017-12-22"}`)
			return
		}
		queries = append(queries, r.URL.Query().Get("q"))
		if len(queries) == 1 {
			fmt.Fprint(w, `{"data":[]}`)
			return
		}
		fmt.Fprint(w, `{"data":[{"id":1,"title":"Dil Diyan Gallan","duration":260,"artist":{"name":"Atif Aslam"}}]}`)
	})}})
	results, err := client.FindTrackMatches(context.Background(), []types.YouTubeVideo{{Title: "Atif Aslam - Dil Diyan Gallan (Official Video)", Duration: &d}}, "broad query")
	if err != nil {
		t.Fatal(err)
	}
	if len(queries) != 2 || queries[0] != "broad query" || !results[0].AutoAccept || results[0].SelectedMatch.ReleaseDate != "2017-12-22" {
		t.Fatalf("queries=%v results=%+v", queries, results)
	}
}

func TestTrackQueriesSplitBeforeNormalization(t *testing.T) {
	queries := trackSearchQueries(types.YouTubeVideo{Title: "Artist - Song | Official Video"}, "")
	if !slices.Contains(queries, "artist") || !slices.Contains(queries, "song") {
		t.Fatalf("missing title segments: %v", queries)
	}
	if slices.Contains(queries, "") {
		t.Fatal("empty query")
	}
}

func TestTrackSearchReportsUpstreamFailure(t *testing.T) {
	client := NewDeezerClient(&http.Client{Transport: deezerTestTransport{handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusServiceUnavailable) })}})
	if _, err := client.FindTrackMatches(context.Background(), []types.YouTubeVideo{{Title: "Artist - Song"}}, "Song"); err == nil {
		t.Fatal("upstream failure was reported as no matches")
	}
}

func TestConflictingIdentityScoresZero(t *testing.T) {
	duration := "PT3M49S"
	for _, test := range []struct{ name, source, title, artist, reason string }{
		{"screenshot quartet", "Katy Perry - Firework HQ (Audio)", "Firework", "Midnite String Quartet", "Different artist"},
		{"screenshot second cover", "Katy Perry - Firework HQ (Audio)", "Firework", "The Cooltrane Quartet", "Different artist"},
		{"reverse source order", "Firework - Katy Perry", "Firework", "Midnite String Quartet", "Different artist"},
		{"different song same artist", "Katy Perry - Firework", "Roar", "Katy Perry", "Different song title"},
		{"longer song title", "Artist - Hello Goodbye", "Hello", "Artist", "Different song title"},
	} {
		t.Run(test.name, func(t *testing.T) {
			m := rankedCandidate(types.YouTubeVideo{Title: test.source, Duration: &duration}, candidate(test.title, test.artist, 229), "1")
			if m.MatchScore != 0 || !slices.Contains(m.MatchEvidence.Reasons, test.reason) {
				t.Fatalf("score=%d evidence=%+v", m.MatchScore, m.MatchEvidence)
			}
			if ok, _ := trackDecision([]types.MusicTrack{m}); ok {
				t.Fatal("conflicting identity automatically accepted")
			}
		})
	}
	correct := rankedCandidate(types.YouTubeVideo{Title: "Katy Perry - Firework HQ (Audio)", Duration: &duration}, candidate("Firework", "Katy Perry", 229), "correct")
	if correct.MatchScore != 100 {
		t.Fatalf("correct identity score=%d evidence=%+v", correct.MatchScore, correct.MatchEvidence)
	}
}

func TestMissingArtistIsUnverifiedRatherThanConflicting(t *testing.T) {
	duration := "PT3M49S"
	m := rankedCandidate(types.YouTubeVideo{Title: "Firework (Audio)", ChannelTitle: "MusickLife", Duration: &duration}, candidate("Firework", "Katy Perry", 229), "1")
	if m.MatchScore == 0 || m.MatchEvidence.ArtistConflict || !slices.Contains(m.MatchEvidence.Reasons, "Artist unverified") {
		t.Fatalf("score=%d evidence=%+v", m.MatchScore, m.MatchEvidence)
	}
	if ok, _ := trackDecision([]types.MusicTrack{m}); ok {
		t.Fatal("unverified artist automatically accepted")
	}
}

func TestPopularityBreaksTiesWithoutOverridingIdentity(t *testing.T) {
	duration := "PT3M49S"
	video := types.YouTubeVideo{Title: "Katy Perry - Firework HQ (Audio)", Duration: &duration}
	album := rankedCandidate(video, candidate("Firework", "Katy Perry", 228), "album")
	single := rankedCandidate(video, candidate("Firework", "Katy Perry", 228), "single")
	cover := rankedCandidate(video, candidate("Firework", "Midnite String Quartet", 229), "cover")
	low, high, highest := 7.68987, 8.17808, 100.0
	album.Popularity = &high
	single.Popularity = &low
	cover.Popularity = &highest
	matches := rankedTracks(map[string]types.MusicTrack{"album": album, "single": single, "cover": cover}, []string{"single", "cover", "album"})
	if matches[0].ID != "album" || matches[2].ID != "cover" {
		t.Fatalf("incorrect popularity order: %+v", matches)
	}
	if ok, _ := trackDecision(matches); !ok {
		t.Fatal("equivalent releases should still allow automatic selection")
	}
	alternative := album
	alternative.ID = "different"
	alternative.Name = "Firework (Alternate)"
	alternative.Popularity = &highest
	matches = rankedTracks(map[string]types.MusicTrack{"album": album, "different": alternative}, []string{"album", "different"})
	if ok, _ := trackDecision(matches); ok {
		t.Fatal("popularity bypassed ambiguity confirmation")
	}
}

func TestPopularityMissingOrEqualPreservesRelevanceOrder(t *testing.T) {
	score := 8.0
	for _, popularity := range []*float64{nil, &score} {
		matches := rankedTracks(map[string]types.MusicTrack{
			"first":  {ID: "first", MatchScore: 99, Popularity: popularity},
			"second": {ID: "second", MatchScore: 99, Popularity: popularity},
		}, []string{"first", "second"})
		if matches[0].ID != "first" {
			t.Fatal("Deezer relevance order changed without a popularity difference")
		}
	}
	matches := rankedTracks(map[string]types.MusicTrack{
		"stronger": {ID: "stronger", MatchScore: 100},
		"popular":  {ID: "popular", MatchScore: 99, Popularity: &score},
	}, []string{"popular", "stronger"})
	if matches[0].ID != "stronger" {
		t.Fatal("popularity overrode a stronger match score")
	}
}
