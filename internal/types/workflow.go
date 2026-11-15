package types

type EditableTrackData struct {
	YoutubeTitle    string   `json:"youtubeTitle,omitempty"`
	YoutubeChannel  string   `json:"youtubeChannel,omitempty"`
	YoutubeDuration string   `json:"youtubeDuration,omitempty"`
	TrackName       string   `json:"trackName,omitempty"`
	ArtistName      string   `json:"artistName,omitempty"`
	AlbumName       string   `json:"albumName,omitempty"`
	AlbumArt        string   `json:"albumArt,omitempty"`
	ReleaseDate     string   `json:"releaseDate,omitempty"`
	TrackDuration   string   `json:"trackDuration,omitempty"`
	Lyrics          string   `json:"lyrics,omitempty"`
	SyncedLyrics    string   `json:"syncedLyrics,omitempty"`
	CustomTags      []string `json:"customTags,omitempty"`
	PersonalRating  *int     `json:"personalRating,omitempty"`
}

type CommitItem struct {
	Song               MusicTrack          `json:"song"`
	Video              YouTubeVideo        `json:"video"`
	LyricsSearchResult *LyricsSearchResult `json:"lyricsSearchResult,omitempty"`
	Edits              EditableTrackData   `json:"edits,omitempty"`
}

type CommitRequest struct {
	Items []CommitItem `json:"items"`
}

type CommitResult struct {
	Code    string `json:"code,omitempty"`
	TrackID string `json:"trackId"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

type CommitResponse struct {
	Results []CommitResult `json:"results"`
}

type SongUpsert struct {
	TrackID        string
	Name           string
	ArtistName     string
	AlbumName      string
	AlbumArt       string
	Lyrics         string
	SyncedLyrics   string
	Duration       string
	YoutubeVideoID string
	IsAvailable    bool
	ReleaseDate    string
}
