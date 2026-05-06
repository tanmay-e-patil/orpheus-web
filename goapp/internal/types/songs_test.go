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
	want := "1|Artist|Song|Album|Art|PT3M|yt"
	if revision != want {
		t.Fatalf("revision = %q, want %q", revision, want)
	}
}
