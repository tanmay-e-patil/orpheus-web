package services

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"testing"

	"orpheus-web/internal/types"
)

func TestLyricsDecision(t *testing.T) {
	q := types.LyricsQuery{Track: "Song", Artist: "Artist", Album: "Album", Duration: 260}
	base := types.LyricsOption{ID: 1, TrackName: "SONG", ArtistName: "artist", AlbumName: "album", Duration: 260, PlainLyrics: "Words", SyncedLyrics: "[00:01.00]Words", HasSync: true}
	tests := []struct {
		name   string
		change func(*types.LyricsOption)
		accept bool
	}{
		{"normalized exact", func(o *types.LyricsOption) {}, true},
		{"different artist", func(o *types.LyricsOption) { o.ArtistName = "Someone Else" }, false},
		{"different timing", func(o *types.LyricsOption) { o.Duration = 268 }, false},
		{"missing timing", func(o *types.LyricsOption) { o.Duration = 0 }, false},
		{"version conflict", func(o *types.LyricsOption) { o.TrackName = "Song Live" }, false},
		{"empty lyrics", func(o *types.LyricsOption) { o.PlainLyrics = ""; o.SyncedLyrics = "" }, false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			option := base
			test.change(&option)
			option.Confidence = CalculateLyricsConfidence(option, q)
			result := types.LyricsSearchResult{Query: q, Options: []types.LyricsOption{option}, Status: "none"}
			selectLyrics(&result)
			if result.AutoAccept != test.accept || (result.SelectedOption != nil) != test.accept {
				t.Fatalf("result=%+v", result)
			}
		})
	}
	competing := base
	competing.ID = 2
	competing.PlainLyrics = "Different words"
	for _, second := range []types.LyricsOption{base, competing} {
		options := []types.LyricsOption{base, second}
		for i := range options {
			options[i].Confidence = CalculateLyricsConfidence(options[i], q)
		}
		result := types.LyricsSearchResult{Query: q, Options: options}
		selectLyrics(&result)
		want := second.PlainLyrics == base.PlainLyrics
		if result.AutoAccept != want {
			t.Fatalf("duplicate/ambiguous decision=%+v", result)
		}
	}
}

func TestLyricsSearchPassesDurationIntoConfidence(t *testing.T) {
	duration := 260000
	client := NewLRCLibClient(&http.Client{Transport: deezerTestTransport{handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[{"id":1,"trackName":"Song","artistName":"Artist","albumName":"Album","duration":260,"plainLyrics":"Words","syncedLyrics":"[00:01.00]Words"}]`)
	})}})
	result, err := client.FetchLyricsOptions(context.Background(), types.MusicTrack{ID: "1", Name: "Song", Artist: "Artist", Album: "Album", DurationMs: &duration})
	if err != nil {
		t.Fatal(err)
	}
	if result.Query.Duration != 260 || !result.AutoAccept || result.SelectedOption == nil || result.Options[0].Confidence != 100 {
		t.Fatalf("result=%+v", result)
	}
}

func TestLyricsSearchReportsFailure(t *testing.T) {
	client := NewLRCLibClient(&http.Client{Transport: deezerTestTransport{handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) })}})
	if _, err := client.FetchLyricsOptions(context.Background(), types.MusicTrack{Name: "Song"}); !errors.Is(err, ErrLyricsUnavailable) {
		t.Fatalf("expected temporary unavailability, got %v", err)
	}
}

func TestLyricsIdentityConflictScoresZero(t *testing.T) {
	q := types.LyricsQuery{Track: "Firework", Artist: "Katy Perry", Duration: 229}
	for _, option := range []types.LyricsOption{
		{TrackName: "Firework", ArtistName: "Midnite String Quartet", Duration: 229},
		{TrackName: "Roar", ArtistName: "Katy Perry", Duration: 229},
	} {
		if score := CalculateLyricsConfidence(option, q); score != 0 {
			t.Fatalf("conflicting lyrics score=%d for %+v", score, option)
		}
	}
}
