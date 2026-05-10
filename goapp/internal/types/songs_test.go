package types

import "testing"

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
	want := "1|Artist|Song|Album|Art|PT3M|yt|0|"
	if revision != want {
		t.Fatalf("revision = %q, want %q", revision, want)
	}
}

func TestSongPageRevisionIncludesAvailability(t *testing.T) {
	unavailable := SongPageRevision([]LibrarySong{{TrackID: "1", IsAvailable: false}})
	available := SongPageRevision([]LibrarySong{{TrackID: "1", IsAvailable: true, AudioURL: "/api/songs/1/audio"}})
	if unavailable == available {
		t.Fatal("revision should change when availability changes")
	}
}
