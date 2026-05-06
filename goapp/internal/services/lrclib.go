package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"

	"orpheus-goapp/internal/types"
)

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
		Query:   types.LyricsQuery{Track: track.Name, Artist: track.Artist, Album: track.Album},
		Options: []types.LyricsOption{},
		Status:  "none",
	}
	searches := []url.Values{
		{"track_name": {track.Name}, "artist_name": {track.Artist}, "album_name": {track.Album}},
		{"track_name": {track.Name}, "artist_name": {track.Artist}},
		{"track_name": {CleanString(track.Name)}, "artist_name": {CleanString(track.Artist)}},
	}
	byID := map[int]types.LyricsOption{}
	for _, params := range searches {
		options, err := c.search(ctx, params)
		if err != nil {
			continue
		}
		for _, option := range options {
			option.Confidence = CalculateLyricsConfidence(option, result.Query)
			existing, ok := byID[option.ID]
			if !ok || option.Confidence > existing.Confidence {
				byID[option.ID] = option
			}
		}
	}
	for _, option := range byID {
		result.Options = append(result.Options, option)
	}
	sort.Slice(result.Options, func(i, j int) bool { return result.Options[i].Confidence > result.Options[j].Confidence })
	if len(result.Options) > 10 {
		result.Options = result.Options[:10]
	}
	if len(result.Options) > 0 {
		result.SelectedOption = &result.Options[0]
		if result.Options[0].Confidence >= 60 {
			result.Status = "found"
		} else {
			result.Status = "partial"
		}
	}
	return result, nil
}

func (c *LRCLibClient) SearchLyricsWithCustomQuery(ctx context.Context, track types.MusicTrack, query string) (types.LyricsSearchResult, error) {
	result := types.LyricsSearchResult{
		TrackID: track.ID,
		Query:   types.LyricsQuery{Track: track.Name, Artist: track.Artist, Album: track.Album},
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
	sort.Slice(options, func(i, j int) bool { return options[i].Confidence > options[j].Confidence })
	if len(options) > 10 {
		options = options[:10]
	}
	result.Options = options
	if len(options) > 0 {
		result.SelectedOption = &result.Options[0]
		if options[0].Confidence >= 60 {
			result.Status = "found"
		} else {
			result.Status = "partial"
		}
	}
	return result, nil
}

func CalculateLyricsConfidence(option types.LyricsOption, original types.LyricsQuery) int {
	score := StringSimilarity(option.TrackName, original.Track) * 0.4
	score += StringSimilarity(option.ArtistName, original.Artist) * 0.3
	if original.Album != "" && option.AlbumName != "" {
		score += StringSimilarity(option.AlbumName, original.Album) * 0.15
	}
	return int(score * 100)
}

func (c *LRCLibClient) search(ctx context.Context, params url.Values) ([]types.LyricsOption, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://lrclib.net/api/search?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Orpheus-Web (https://github.com/tanmay-e-patil/orpheus-web)")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		buf := new(bytes.Buffer)
		_, _ = buf.ReadFrom(res.Body)
		return nil, fmt.Errorf("lrclib search failed: %s %s", res.Status, buf.String())
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
