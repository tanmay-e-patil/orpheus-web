package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"orpheus-web/internal/store"
	"orpheus-web/internal/types"
)

type DeezerClient struct {
	HTTP               *http.Client
	authMu             sync.Mutex
	anonymousJWT       string
	anonymousJWTExpiry time.Time
	graphQLRetryAfter  time.Time
}

func NewDeezerClient(httpClient *http.Client) *DeezerClient {
	return &DeezerClient{HTTP: httpClient}
}

func (c *DeezerClient) SearchMusic(ctx context.Context, query string) (map[string]any, error) {
	encoded := url.QueryEscape(query)
	endpoints := map[string]string{
		"tracks":  "https://api.deezer.com/search?q=" + encoded + "&limit=20",
		"albums":  "https://api.deezer.com/search/album?q=" + encoded + "&limit=20",
		"artists": "https://api.deezer.com/search/artist?q=" + encoded + "&limit=20",
	}
	out := make(map[string]any, len(endpoints))
	for name, endpoint := range endpoints {
		var data any
		if err := c.getJSON(ctx, endpoint, &data); err != nil {
			return nil, err
		}
		out[name] = data
	}
	return out, nil
}

func (c *DeezerClient) FindTrackMatches(ctx context.Context, videos []types.YouTubeVideo, searchQuery string) ([]types.TrackMatchResult, error) {
	results := make([]types.TrackMatchResult, 0, len(videos))
	for _, video := range videos {
		result, err := c.findTrackMatchesForVideo(ctx, video, searchQuery)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	return results, nil
}

func (c *DeezerClient) SearchTrackWithCustomQuery(ctx context.Context, video types.YouTubeVideo, query string) (types.TrackMatchResult, error) {
	return c.searchTrackMatches(ctx, video, []string{query})
}

func (c *DeezerClient) RefreshAlbumArt(ctx context.Context, db *store.Store, trackIDs []string) (map[string]string, error) {
	songs, err := db.SongsForAlbumRefresh(ctx, trackIDs)
	if err != nil {
		return nil, err
	}
	updated := map[string]string{}
	for _, song := range songs {
		select {
		case <-ctx.Done():
			return updated, ctx.Err()
		case <-time.After(120 * time.Millisecond):
		}
		query := fmt.Sprintf(`track:"%s" artist:"%s"`, song.Name, song.ArtistName)
		var response deezerSearchResponse
		if err := c.getJSON(ctx, "https://api.deezer.com/search?q="+url.QueryEscape(query)+"&limit=1", &response); err != nil {
			continue
		}
		if len(response.Data) == 0 {
			continue
		}
		art := response.Data[0].Album.bestCover()
		if art == "" {
			continue
		}
		if err := db.UpdateAlbumArt(ctx, song.TrackID, art); err != nil {
			return updated, err
		}
		updated[song.TrackID] = art
	}
	return updated, nil
}

func (c *DeezerClient) findTrackMatchesForVideo(ctx context.Context, video types.YouTubeVideo, customQuery string) (types.TrackMatchResult, error) {
	return c.searchTrackMatches(ctx, video, trackSearchQueries(video, customQuery))
}

func (c *DeezerClient) searchTrackMatches(ctx context.Context, video types.YouTubeVideo, searchQueries []string) (types.TrackMatchResult, error) {
	bestByID := map[string]types.MusicTrack{}
	var candidateIDs []string
	var lastErr error
	succeeded := false
	for _, searchQuery := range searchQueries {
		if strings.TrimSpace(searchQuery) == "" {
			continue
		}
		tracks, err := c.searchTracks(ctx, searchQuery)
		if err != nil {
			lastErr = err
			continue
		}
		succeeded = true
		for _, track := range tracks {
			match := track.toMusicTrack()
			match.MatchScore, match.MatchEvidence = scoreTrackMatch(video, track)
			existing, ok := bestByID[match.ID]
			if !ok {
				candidateIDs = append(candidateIDs, match.ID)
			}
			if !ok || match.MatchScore > existing.MatchScore {
				bestByID[match.ID] = match
			}
		}
		ranked := rankedTracks(bestByID, candidateIDs)
		if accepted, _ := trackDecision(ranked); accepted {
			break
		}
		if err := ctx.Err(); err != nil {
			return types.TrackMatchResult{}, err
		}
	}

	if !succeeded && lastErr != nil {
		return types.TrackMatchResult{}, lastErr
	}
	matches := rankedTracks(bestByID, candidateIDs)
	autoAccept, reasons := trackDecision(matches)
	if len(matches) > 10 {
		matches = matches[:10]
	}
	for i := range matches {
		if matches[i].ReleaseDate != "" {
			continue
		}
		date, _ := c.fetchTrackDate(ctx, matches[i].ID)
		if date != "" {
			matches[i].ReleaseDate = date
		}
	}
	var selected *types.MusicTrack
	confidence := "none"
	if len(matches) > 0 {
		confidence = ConfidenceFromScore(matches[0].MatchScore)
		if autoAccept {
			selected = &matches[0]
			confidence = "high"
		} else if confidence == "high" {
			confidence = "medium"
		}
	}
	return types.TrackMatchResult{
		YouTubeVideo:  video,
		TrackMatches:  matches,
		SelectedMatch: selected,
		Confidence:    confidence,
		AutoAccept:    autoAccept,
		Reasons:       reasons,
	}, nil
}

func rankedTracks(byID map[string]types.MusicTrack, ids []string) []types.MusicTrack {
	matches := make([]types.MusicTrack, 0, len(ids))
	for _, id := range ids {
		matches = append(matches, byID[id])
	}
	sort.SliceStable(matches, func(i, j int) bool {
		a, b := matches[i], matches[j]
		if a.MatchScore != b.MatchScore {
			return a.MatchScore > b.MatchScore
		}
		if a.Popularity == nil {
			return false
		}
		if b.Popularity == nil {
			return true
		}
		return *a.Popularity > *b.Popularity
	})
	return matches
}

func (c *DeezerClient) fetchTrackDate(ctx context.Context, trackID string) (string, error) {
	var track struct {
		ReleaseDate string `json:"release_date"`
	}
	if err := c.getJSON(ctx, "https://api.deezer.com/track/"+url.PathEscape(trackID), &track); err != nil {
		return "", err
	}
	return SanitizeDeezerDate(track.ReleaseDate), nil
}

func SanitizeDeezerDate(raw string) string {
	s := strings.TrimSpace(raw)
	if regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`).MatchString(s) {
		parts := strings.Split(s, "-")
		if parts[0] == "0000" {
			return ""
		}
		return s
	}
	if regexp.MustCompile(`^\d{4}$`).MatchString(s) && s != "0000" {
		return s + "-01-01"
	}
	return ""
}

func (c *DeezerClient) getJSON(ctx context.Context, rawURL string, dst any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusTooManyRequests {
		return fmt.Errorf("deezer rate limited: %w", ErrRateLimited)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("deezer request failed: %s", res.Status)
	}
	return json.NewDecoder(res.Body).Decode(dst)
}

type deezerSearchResponse struct {
	Data []deezerTrack `json:"data"`
}

type deezerTrack struct {
	ID          int      `json:"id"`
	Title       string   `json:"title"`
	Duration    int      `json:"duration"`
	Popularity  *float64 `json:"popularity,omitempty"`
	ReleaseDate string   `json:"release_date"`
	Artist      struct {
		Name string `json:"name"`
	} `json:"artist"`
	Album deezerAlbum `json:"album"`
}

type deezerAlbum struct {
	Title       string `json:"title"`
	Cover       string `json:"cover"`
	CoverMedium string `json:"cover_medium"`
	CoverBig    string `json:"cover_big"`
	CoverXL     string `json:"cover_xl"`
}

func (a deezerAlbum) bestCover() string {
	if a.CoverXL != "" {
		return a.CoverXL
	}
	if a.CoverBig != "" {
		return a.CoverBig
	}
	if a.CoverMedium != "" {
		return a.CoverMedium
	}
	return a.Cover
}

func (t deezerTrack) toMusicTrack() types.MusicTrack {
	durationMs := 0
	var durationPtr *int
	if t.Duration > 0 {
		durationMs = t.Duration * 1000
		durationPtr = &durationMs
	}
	return types.MusicTrack{
		ID:            fmt.Sprintf("%d", t.ID),
		Name:          t.Title,
		Artist:        t.Artist.Name,
		Album:         t.Album.Title,
		AlbumImageURL: t.Album.bestCover(),
		ReleaseDate:   SanitizeDeezerDate(t.ReleaseDate),
		DurationMs:    durationPtr,
		Popularity:    t.Popularity,
	}
}
