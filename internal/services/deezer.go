package services

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"orpheus-web/internal/store"
	"orpheus-web/internal/types"
)

type DeezerClient struct {
	HTTP *http.Client
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
			results = append(results, types.TrackMatchResult{YouTubeVideo: video, TrackMatches: []types.MusicTrack{}, Confidence: "none"})
			continue
		}
		results = append(results, result)
	}
	return results, nil
}

func (c *DeezerClient) SearchTrackWithCustomQuery(ctx context.Context, video types.YouTubeVideo, query string) (types.TrackMatchResult, error) {
	return c.findTrackMatchesForVideo(ctx, video, query)
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
			continue
		}
		updated[song.TrackID] = art
	}
	return updated, nil
}

func (c *DeezerClient) findTrackMatchesForVideo(ctx context.Context, video types.YouTubeVideo, customQuery string) (types.TrackMatchResult, error) {
	searchQueries := []string{customQuery}
	if strings.TrimSpace(customQuery) == "" {
		title := CleanString(video.Title)
		searchQueries = []string{
			title,
			strings.TrimSpace(regexp.MustCompile(`official|video|audio|lyrics|hd|4k`).ReplaceAllString(title, "")),
			strings.TrimSpace(strings.Split(title, "-")[0]),
			strings.TrimSpace(strings.Split(title, "|")[0]),
		}
	}

	bestByID := map[string]types.MusicTrack{}
	var candidateIDs []string
	for _, searchQuery := range searchQueries {
		if strings.TrimSpace(searchQuery) == "" {
			continue
		}
		var response deezerSearchResponse
		if err := c.getJSON(ctx, "https://api.deezer.com/search?q="+url.QueryEscape(searchQuery)+"&limit=10", &response); err != nil {
			return types.TrackMatchResult{}, err
		}
		for _, track := range response.Data {
			match := track.toMusicTrack()
			match.MatchScore = scoreTrackMatch(video, track)
			existing, ok := bestByID[match.ID]
			if !ok {
				candidateIDs = append(candidateIDs, match.ID)
			}
			if !ok || match.MatchScore > existing.MatchScore {
				bestByID[match.ID] = match
			}
		}
		select {
		case <-ctx.Done():
			return types.TrackMatchResult{}, ctx.Err()
		case <-time.After(120 * time.Millisecond):
		}
	}

	matches := make([]types.MusicTrack, 0, len(bestByID))
	for _, id := range candidateIDs {
		matches = append(matches, bestByID[id])
	}
	// Preserve Deezer's relevance order when supporting evidence scores tie.
	sort.SliceStable(matches, func(i, j int) bool { return matches[i].MatchScore > matches[j].MatchScore })
	if len(matches) > 10 {
		matches = matches[:10]
	}
	for i := range matches {
		date, _ := c.fetchTrackDate(ctx, matches[i].ID)
		if date != "" {
			matches[i].ReleaseDate = date
		}
		time.Sleep(80 * time.Millisecond)
	}
	var selected *types.MusicTrack
	confidence := "none"
	if len(matches) > 0 {
		confidence = ConfidenceFromScore(matches[0].MatchScore)
		if confidence == "high" {
			selected = &matches[0]
		}
	}
	return types.TrackMatchResult{
		YouTubeVideo:  video,
		TrackMatches:  matches,
		SelectedMatch: selected,
		Confidence:    confidence,
	}, nil
}

func scoreTrackMatch(video types.YouTubeVideo, track deezerTrack) int {
	score := StringSimilarity(CleanString(video.Title), CleanString(track.Title+" "+track.Artist.Name)) * 0.7
	if strings.Contains(CleanString(video.Title), CleanString(track.Artist.Name)) {
		score += 0.2
	}
	if video.Duration != nil && track.Duration > 0 {
		videoDurationMs := ParseISODurationSeconds(*video.Duration) * 1000
		trackDurationMs := track.Duration * 1000
		diff := math.Abs(float64(videoDurationMs - trackDurationMs))
		score += math.Max(0, 1-diff/30000) * 0.1
	}
	return int(math.Round(score * 100))
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
	ID          int    `json:"id"`
	Title       string `json:"title"`
	Duration    int    `json:"duration"`
	ReleaseDate string `json:"release_date"`
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
	}
}
