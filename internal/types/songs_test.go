package types

import (
	"encoding/json"
	"testing"
	"time"
)

func TestSongPageRevisionMatchesFieldOrder(t *testing.T) {
	revision := SongPageRevision([]LibrarySong{{
		TrackID:        "1",
		ArtistName:     "Artist",
		Name:           "Song",
		AlbumName:      "Album",
		AlbumArt:       "Art",
		Duration:       "PT3M",
		YoutubeVideoID: "yt",
	}})
	want := "1|Artist|Song|Album|Art|PT3M|yt|0||0"
	if revision != want {
		t.Fatalf("revision = %q, want %q", revision, want)
	}
}

func TestRecentlyAddedCursorIncludesCreatedAt(t *testing.T) {
	createdAt := time.Date(2026, time.August, 2, 12, 0, 0, 0, time.UTC)
	got, err := json.Marshal(SongCursor{TrackID: "track-1", CreatedAt: &createdAt})
	if err != nil {
		t.Fatal(err)
	}
	want := `{"artistName":"","trackId":"track-1","createdAt":"2026-08-02T12:00:00Z"}`
	if string(got) != want {
		t.Fatalf("cursor = %s, want %s", got, want)
	}
}

func TestSongPageRevisionIncludesAvailability(t *testing.T) {
	unavailable := SongPageRevision([]LibrarySong{{TrackID: "1", IsAvailable: false}})
	available := SongPageRevision([]LibrarySong{{TrackID: "1", IsAvailable: true, AudioURL: "/api/songs/1/audio"}})
	if unavailable == available {
		t.Fatal("revision should change when availability changes")
	}
}
