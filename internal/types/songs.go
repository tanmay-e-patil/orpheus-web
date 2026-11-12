package types

import (
	"strconv"
	"strings"
	"time"
)

type SongCursor struct {
	ArtistName string     `json:"artistName"`
	TrackID    string     `json:"trackId"`
	PlayCount  int        `json:"playCount,omitempty"`
	CreatedAt  *time.Time `json:"createdAt,omitempty"`
}

type LibrarySong struct {
	TrackID           string    `json:"trackId"`
	Name              string    `json:"name"`
	ArtistName        string    `json:"artistName"`
	AlbumName         string    `json:"albumName"`
	AlbumArt          string    `json:"albumArt"`
	Duration          string    `json:"duration"`
	YoutubeVideoID    string    `json:"youtubeVideoId"`
	IsAvailable       bool      `json:"isAvailable"`
	AudioURL          string    `json:"audioUrl,omitempty"`
	Lyrics            string    `json:"lyrics,omitempty"`
	SyncedLyrics      string    `json:"syncedLyrics,omitempty"`
	IsLyricsAvailable *bool     `json:"isLyricsAvailable,omitempty"`
	PlayCount         int       `json:"playCount"`
	CreatedAt         time.Time `json:"-"`
}

type AudioSong struct {
	AudioFilePath string
	TrackID       string
	Name          string
	ArtistName    string
	AlbumName     string
	IsAvailable   bool
	UpdatedAt     time.Time
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
	var out strings.Builder
	for i, song := range songs {
		if i > 0 {
			out.WriteString("||")
		}
		available := "0"
		if song.IsAvailable {
			available = "1"
		}
		for j, part := range [...]string{song.TrackID, song.ArtistName, song.Name, song.AlbumName, song.AlbumArt, song.Duration, song.YoutubeVideoID, available, song.AudioURL, strconv.Itoa(song.PlayCount)} {
			if j > 0 {
				out.WriteByte('|')
			}
			out.WriteString(part)
		}
	}
	return out.String()
}
