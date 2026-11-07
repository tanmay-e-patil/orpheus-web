package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"orpheus-web/internal/types"
)

var ErrLyricsUnavailable = errors.New("lyrics service temporarily unavailable")

type LRCLibClient struct {
	HTTP *http.Client
}

func NewLRCLibClient(httpClient *http.Client) *LRCLibClient {
	return &LRCLibClient{HTTP: httpClient}
}

func (c *LRCLibClient) GetExact(ctx context.Context, trackName, artistName, albumName string, durationSec int) (map[string]any, int, error) {
	params := url.Values{}
	params.Set("track_name", trackName)
	params.Set("artist_name", artistName)
	params.Set("album_name", albumName)
	params.Set("duration", fmt.Sprintf("%d", durationSec))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://lrclib.net/api/get?"+params.Encode(), nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", "Orpheus-Web (https://github.com/tanmay-e-patil/orpheus-web)")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return map[string]any{"notFound": true}, http.StatusNotFound, nil
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, res.StatusCode, fmt.Errorf("lrclib request failed: %s", res.Status)
	}
	var data map[string]any
	if err := json.NewDecoder(res.Body).Decode(&data); err != nil {
		return nil, res.StatusCode, err
	}
	return data, res.StatusCode, nil
}

func (c *LRCLibClient) FetchLyricsOptions(ctx context.Context, track types.MusicTrack) (types.LyricsSearchResult, error) {
	result := types.LyricsSearchResult{
		TrackID: track.ID,
		Query:   lyricsQuery(track),
		Options: []types.LyricsOption{},
		Status:  "none",
	}
	searches := []url.Values{
		{"track_name": {track.Name}, "artist_name": {track.Artist}, "album_name": {track.Album}},
		{"track_name": {track.Name}, "artist_name": {track.Artist}},
		{"track_name": {CleanString(track.Name)}, "artist_name": {CleanString(track.Artist)}},
	}
	byID := map[int]types.LyricsOption{}
	var lastErr error
	succeeded := false
	for _, params := range searches {
		options, err := c.search(ctx, params)
		if err != nil {
			lastErr = err
			continue
		}
		succeeded = true
		for _, option := range options {
			option.Confidence = CalculateLyricsConfidence(option, result.Query)
			existing, ok := byID[option.ID]
			if !ok || option.Confidence > existing.Confidence {
				byID[option.ID] = option
			}
		}
	}
	if !succeeded && lastErr != nil {
		return result, lastErr
	}
	for _, option := range byID {
		result.Options = append(result.Options, option)
	}
	selectLyrics(&result)
	return result, nil
}

func (c *LRCLibClient) SearchLyricsWithCustomQuery(ctx context.Context, track types.MusicTrack, query string) (types.LyricsSearchResult, error) {
	result := types.LyricsSearchResult{
		TrackID: track.ID,
		Query:   lyricsQuery(track),
		Options: []types.LyricsOption{},
		Status:  "none",
	}
	options, err := c.search(ctx, url.Values{"q": {query}})
	if err != nil {
		return result, err
	}
	for i := range options {
		options[i].Confidence = CalculateLyricsConfidence(options[i], result.Query)
	}
	result.Options = options
	selectLyrics(&result)
	return result, nil
}

func lyricsQuery(track types.MusicTrack) types.LyricsQuery {
	q := types.LyricsQuery{Track: track.Name, Artist: track.Artist, Album: track.Album}
	if track.DurationMs != nil && *track.DurationMs > 0 {
		q.Duration = float64(*track.DurationMs) / 1000
	}
	return q
}

func CalculateLyricsConfidence(option types.LyricsOption, original types.LyricsQuery) int {
	if (option.TrackName != "" && original.Track != "" && tokenSimilarity(recordingTitle(option.TrackName), recordingTitle(original.Track)) < .85) ||
		(option.ArtistName != "" && original.Artist != "" && tokenSimilarity(option.ArtistName, original.Artist) < .9) {
		return 0
	}

	score := tokenSimilarity(option.TrackName, original.Track)*45 + tokenSimilarity(option.ArtistName, original.Artist)*30
	if original.Album != "" && option.AlbumName != "" {
		score += tokenSimilarity(option.AlbumName, original.Album) * 5
	}
	if original.Duration > 0 && option.Duration > 0 {
		d, conflict := durationEvidence(original.Duration, option.Duration)
		score += 20 * d
		if conflict {
			score -= 20
		}
	}
	if versionConflict(option.TrackName, original.Track) {
		score -= 40
	}
	return int(math.Round(math.Max(0, score)))
}

func selectLyrics(result *types.LyricsSearchResult) {
	sort.Slice(result.Options, func(i, j int) bool {
		a, b := result.Options[i], result.Options[j]
		if a.Confidence != b.Confidence {
			return a.Confidence > b.Confidence
		}
		if a.HasSync != b.HasSync {
			return a.HasSync
		}
		return a.ID < b.ID
	})
	if len(result.Options) == 0 {
		return
	}
	top := result.Options[0]
	q := result.Query
	strong := top.Confidence >= 90 && CleanString(top.TrackName) == CleanString(q.Track) && CleanString(top.ArtistName) == CleanString(q.Artist) &&
		q.Duration > 0 && top.Duration > 0 && math.Abs(q.Duration-top.Duration) <= 3 && !versionConflict(top.TrackName, q.Track) &&
		(strings.TrimSpace(top.PlainLyrics) != "" || strings.TrimSpace(top.SyncedLyrics) != "")
	for _, other := range result.Options[1:] {
		sameText := strings.TrimSpace(top.PlainLyrics) == strings.TrimSpace(other.PlainLyrics) && strings.TrimSpace(top.SyncedLyrics) == strings.TrimSpace(other.SyncedLyrics)
		if top.Confidence-other.Confidence < 8 && !sameText {
			strong = false
		}
	}
	result.Status = "partial"
	result.AutoAccept = strong
	if strong {
		result.SelectedOption = &result.Options[0]
		result.Status = "found"
	}
	if len(result.Options) > 10 {
		result.Options = result.Options[:10]
	}
}

func (c *LRCLibClient) search(ctx context.Context, params url.Values) ([]types.LyricsOption, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://lrclib.net/api/search?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Orpheus-Web (https://github.com/tanmay-e-patil/orpheus-web)")
	res, err := c.HTTP.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("%w: %v", ErrLyricsUnavailable, err)
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		if res.StatusCode == http.StatusTooManyRequests || res.StatusCode >= 500 {
			return nil, fmt.Errorf("%w: %s", ErrLyricsUnavailable, res.Status)
		}
		return nil, fmt.Errorf("lrclib search failed: %s", res.Status)
	}
	var raw []struct {
		ID           int     `json:"id"`
		TrackName    string  `json:"trackName"`
		Name         string  `json:"name"`
		ArtistName   string  `json:"artistName"`
		Artist       string  `json:"artist"`
		AlbumName    string  `json:"albumName"`
		Album        string  `json:"album"`
		Duration     float64 `json:"duration"`
		PlainLyrics  string  `json:"plainLyrics"`
		SyncedLyrics string  `json:"syncedLyrics"`
	}
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		return nil, err
	}
	options := make([]types.LyricsOption, 0, len(raw))
	for _, item := range raw {
		if strings.TrimSpace(item.PlainLyrics) == "" && strings.TrimSpace(item.SyncedLyrics) == "" {
			continue
		}
		trackName := item.TrackName
		if trackName == "" {
			trackName = item.Name
		}
		artistName := item.ArtistName
		if artistName == "" {
			artistName = item.Artist
		}
		albumName := item.AlbumName
		if albumName == "" {
			albumName = item.Album
		}
		options = append(options, types.LyricsOption{
			ID:           item.ID,
			TrackName:    trackName,
			ArtistName:   artistName,
			AlbumName:    albumName,
			Duration:     item.Duration,
			PlainLyrics:  item.PlainLyrics,
			SyncedLyrics: item.SyncedLyrics,
			Source:       "lrclib",
			HasSync:      item.SyncedLyrics != "",
		})
	}
	return options, nil
}
