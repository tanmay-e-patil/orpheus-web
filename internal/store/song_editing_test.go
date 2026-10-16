package store

import "testing"

func TestMetadataRequiresFileUpdate(t *testing.T) {
	current := SongMetadataUpdate{Name: "Song", ArtistName: "Artist", AlbumName: "Album", AlbumArt: "cover.jpg", ReleaseDate: "2020-01-01"}
	for field, changed := range map[string]SongMetadataUpdate{
		"name":         {Name: "Renamed", ArtistName: "Artist", AlbumName: "Album", AlbumArt: "cover.jpg"},
		"artist":       {Name: "Song", ArtistName: "New Artist", AlbumName: "Album", AlbumArt: "cover.jpg"},
		"album":        {Name: "Song", ArtistName: "Artist", AlbumName: "New Album", AlbumArt: "cover.jpg"},
		"release date": {Name: "Song", ArtistName: "Artist", AlbumName: "Album", AlbumArt: "cover.jpg", ReleaseDate: "2021-01-01"},
		"album art":    {Name: "Song", ArtistName: "Artist", AlbumName: "Album", AlbumArt: "new-cover.jpg"},
	} {
		t.Run(field, func(t *testing.T) {
			if !metadataRequiresFileUpdate(current, changed) {
				t.Fatal("metadata change should require a library file update")
			}
		})
	}
	preserveDate := current
	preserveDate.ReleaseDate = ""
	if metadataRequiresFileUpdate(current, preserveDate) {
		t.Fatal("empty date preserves existing release date")
	}
	if metadataRequiresFileUpdate(current, current) {
		t.Fatal("unchanged metadata should not require a library file update")
	}
}
