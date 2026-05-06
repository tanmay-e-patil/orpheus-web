package types

type SongCursor struct {
	ArtistName string `json:"artistName"`
	TrackID    string `json:"trackId"`
}

type LibrarySong struct {
	TrackID           string `json:"trackId"`
	Name              string `json:"name"`
	ArtistName        string `json:"artistName"`
	AlbumName         string `json:"albumName"`
	AlbumArt          string `json:"albumArt"`
	Duration          string `json:"duration"`
	YoutubeVideoID    string `json:"youtubeVideoId"`
	Lyrics            string `json:"lyrics,omitempty"`
	SyncedLyrics      string `json:"syncedLyrics,omitempty"`
	IsLyricsAvailable *bool  `json:"isLyricsAvailable,omitempty"`
}

type SongsPageResponse struct {
	Songs        []LibrarySong `json:"songs"`
	NextCursor   *SongCursor   `json:"nextCursor"`
	HasMore      bool          `json:"hasMore"`
	PageRevision string        `json:"pageRevision"`
}

type RefreshAlbumArtRequest struct {
	TrackIDs []string `json:"trackIds"`
}

type RefreshAlbumArtResponse struct {
	Updated map[string]string `json:"updated"`
}

type SaveLyricsRequest struct {
	TrackID      string `json:"trackId"`
	SpotifyID    string `json:"spotifyId"`
	PlainLyrics  string `json:"plainLyrics"`
	SyncedLyrics string `json:"syncedLyrics"`
}

func SongPageRevision(songs []LibrarySong) string {
	out := ""
	for i, song := range songs {
		if i > 0 {
			out += "||"
		}
		out += song.TrackID + "|" + song.ArtistName + "|" + song.Name + "|" + song.AlbumName + "|" + song.AlbumArt + "|" + song.Duration + "|" + song.YoutubeVideoID
	}
	return out
}
