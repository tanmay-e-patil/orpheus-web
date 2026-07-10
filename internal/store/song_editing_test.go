package store

import "testing"

func TestMetadataRequiresRegeneration(t *testing.T) {
	current := SongMetadataUpdate{Name: "Song", ArtistName: "Artist", AlbumName: "Album", AlbumArt: "cover.jpg"}
	for field, changed := range map[string]SongMetadataUpdate{
		"name":      {Name: "Renamed", ArtistName: "Artist", AlbumName: "Album", AlbumArt: "cover.jpg"},
		"artist":    {Name: "Song", ArtistName: "New Artist", AlbumName: "Album", AlbumArt: "cover.jpg"},
		"album":     {Name: "Song", ArtistName: "Artist", AlbumName: "New Album", AlbumArt: "cover.jpg"},
		"album art": {Name: "Song", ArtistName: "Artist", AlbumName: "Album", AlbumArt: "new-cover.jpg"},
	} {
		t.Run(field, func(t *testing.T) {
			if !metadataRequiresRegeneration(current, changed) {
				t.Fatal("metadata change should require Audio File Regeneration")
			}
		})
	}
	if metadataRequiresRegeneration(current, current) {
		t.Fatal("unchanged metadata should not require Audio File Regeneration")
	}
}
