package types

type YouTubeVideo struct {
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	Thumbnail    string  `json:"thumbnail"`
	ChannelTitle string  `json:"channelTitle"`
	PublishedAt  string  `json:"publishedAt"`
	Duration     *string `json:"duration"`
	ViewCount    *string `json:"viewCount"`
}

type MusicTrack struct {
	ID            string         `json:"id"`
	Name          string         `json:"name"`
	Artist        string         `json:"artist"`
	Album         string         `json:"album"`
	AlbumImageURL string         `json:"albumImageUrl"`
	ReleaseDate   string         `json:"releaseDate"`
	DurationMs    *int           `json:"durationMs,omitempty"`
	MatchScore    int            `json:"matchScore,omitempty"`
	Popularity    *float64       `json:"popularity,omitempty"`
	MatchEvidence *MatchEvidence `json:"matchEvidence,omitempty"`
}

type MatchEvidence struct {
	TitleConflict    bool     `json:"titleConflict"`
	ArtistConflict   bool     `json:"artistConflict"`
	TitleExact       bool     `json:"titleExact"`
	TitleScore       int      `json:"titleScore"`
	ArtistScore      int      `json:"artistScore"`
	DurationScore    *int     `json:"durationScore,omitempty"`
	VersionConflict  bool     `json:"versionConflict"`
	DurationConflict bool     `json:"durationConflict"`
	Reasons          []string `json:"reasons"`
}

type YouTubeDiscoveryResult struct {
	YouTubeVideo
	Confidence       int     `json:"confidence"`
	MusicProbability float64 `json:"musicProbability"`
	Selected         bool    `json:"selected,omitempty"`
}

type TrackMatchResult struct {
	YouTubeVideo  YouTubeVideo `json:"youtubeVideo"`
	TrackMatches  []MusicTrack `json:"trackMatches"`
	SelectedMatch *MusicTrack  `json:"selectedMatch,omitempty"`
	Confidence    string       `json:"confidence"`
	AutoAccept    bool         `json:"autoAccept"`
	Reasons       []string     `json:"reasons"`
}

type LyricsOption struct {
	ID           int     `json:"id"`
	TrackName    string  `json:"trackName"`
	ArtistName   string  `json:"artistName"`
	AlbumName    string  `json:"albumName,omitempty"`
	Duration     float64 `json:"duration,omitempty"`
	PlainLyrics  string  `json:"plainLyrics,omitempty"`
	SyncedLyrics string  `json:"syncedLyrics,omitempty"`
	Source       string  `json:"source"`
	Confidence   int     `json:"confidence"`
	HasSync      bool    `json:"hasSync"`
}

type LyricsQuery struct {
	Track    string  `json:"track"`
	Artist   string  `json:"artist"`
	Album    string  `json:"album,omitempty"`
	Duration float64 `json:"duration,omitempty"`
}

type LyricsSearchResult struct {
	TrackID        string         `json:"trackId"`
	Query          LyricsQuery    `json:"query"`
	Options        []LyricsOption `json:"options"`
	SelectedOption *LyricsOption  `json:"selectedOption,omitempty"`
	Status         string         `json:"status"`
	AutoAccept     bool           `json:"autoAccept"`
}

type LRCLibExactRequest struct {
	TrackName   string `json:"trackName"`
	ArtistName  string `json:"artistName"`
	AlbumName   string `json:"albumName"`
	DurationSec *int   `json:"durationSec"`
	ISODuration string `json:"isoDuration"`
}

type DiscoverYouTubeRequest struct {
	Query string `json:"query"`
}

type MatchTracksRequest struct {
	Videos      []YouTubeVideo `json:"videos"`
	SearchQuery string         `json:"searchQuery"`
}

type CustomTrackMatchRequest struct {
	Video       YouTubeVideo `json:"video"`
	CustomQuery string       `json:"customQuery"`
}

type LyricsOptionsRequest struct {
	Track MusicTrack `json:"track"`
}

type CustomLyricsSearchRequest struct {
	Track       MusicTrack `json:"track"`
	CustomQuery string     `json:"customQuery"`
}
