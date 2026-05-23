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

	"orpheus-goapp/internal/types"
)

type YouTubeClient struct {
	APIKey string
	HTTP   *http.Client
}

func NewYouTubeClient(apiKey string, httpClient *http.Client) *YouTubeClient {
	return &YouTubeClient{APIKey: apiKey, HTTP: httpClient}
}

func (c *YouTubeClient) DiscoverVideos(ctx context.Context, query string) ([]types.YouTubeDiscoveryResult, error) {
	videos, err := c.SearchVideo(ctx, query, "")
	if err != nil {
		return nil, err
	}
	results := make([]types.YouTubeDiscoveryResult, 0, len(videos))
	for _, video := range videos {
		probability := youtubeMusicProbability(video)
		results = append(results, types.YouTubeDiscoveryResult{
			YouTubeVideo:     video,
			Confidence:       int(math.Round(probability * 100)),
			MusicProbability: probability,
		})
	}
	sort.Slice(results, func(i, j int) bool {
		return results[i].Confidence > results[j].Confidence
	})
	return results, nil
}

func (c *YouTubeClient) SearchVideo(ctx context.Context, trackName, artistName string) ([]types.YouTubeVideo, error) {
	if c.APIKey == "" {
		return nil, errors.New("YouTube API key is not configured")
	}
	query := strings.TrimSpace(trackName + " " + artistName)
	searchURL := "https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=25&type=video&key=" + url.QueryEscape(c.APIKey) + "&q=" + url.QueryEscape(query)
	var search youtubeSearchResponse
	if err := c.getJSON(ctx, searchURL, &search); err != nil {
		return nil, err
	}
	if len(search.Items) == 0 {
		return []types.YouTubeVideo{}, nil
	}

	ids := make([]string, 0, len(search.Items))
	for _, item := range search.Items {
		if item.ID.VideoID != "" {
			ids = append(ids, item.ID.VideoID)
		}
	}
	detailsURL := "https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&key=" + url.QueryEscape(c.APIKey) + "&id=" + url.QueryEscape(strings.Join(ids, ","))
	var details youtubeDetailsResponse
	if err := c.getJSON(ctx, detailsURL, &details); err != nil {
		return nil, err
	}
	detailByID := make(map[string]youtubeDetailsItem, len(details.Items))
	for _, item := range details.Items {
		detailByID[item.ID] = item
	}

	videos := make([]types.YouTubeVideo, 0, len(search.Items))
	for _, item := range search.Items {
		videoID := item.ID.VideoID
		if videoID == "" {
			continue
		}
		detail := detailByID[videoID]
		duration := nullableString(detail.ContentDetails.Duration)
		viewCount := nullableString(detail.Statistics.ViewCount)
		thumbnail := item.Snippet.Thumbnails.Medium.URL
		if thumbnail == "" {
			thumbnail = item.Snippet.Thumbnails.Default.URL
		}
		videos = append(videos, types.YouTubeVideo{
			ID:           videoID,
			Title:        item.Snippet.Title,
			Thumbnail:    thumbnail,
			ChannelTitle: item.Snippet.ChannelTitle,
			PublishedAt:  item.Snippet.PublishedAt,
			Duration:     duration,
			ViewCount:    viewCount,
		})
	}
	return videos, nil
}

func (c *YouTubeClient) getJSON(ctx context.Context, rawURL string, dst any) error {
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
		return fmt.Errorf("youtube rate limited: %w", ErrRateLimited)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("youtube request failed: %s", res.Status)
	}
	return json.NewDecoder(res.Body).Decode(dst)
}

func youtubeMusicProbability(video types.YouTubeVideo) float64 {
	title := strings.ToLower(video.Title)
	channel := strings.ToLower(video.ChannelTitle)
	probability := 0.5
	keywords := map[string]bool{"official": true, "audio": true, "lyrics": true, "music": true, "song": true, "album": true, "single": true, "mv": true, "video": true}
	for _, word := range strings.Fields(title) {
		if keywords[word] {
			probability += 0.1
		}
	}
	if strings.Contains(channel, "official") || strings.Contains(channel, "music") || strings.Contains(channel, "records") {
		probability += 0.2
	}
	if video.Duration != nil {
		seconds := ParseISODurationSeconds(*video.Duration)
		if seconds >= 120 && seconds <= 480 {
			probability += 0.15
		}
	}
	return math.Min(1, math.Max(0, probability))
}

func nullableString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

type youtubeSearchResponse struct {
	Items []struct {
		ID struct {
			VideoID string `json:"videoId"`
		} `json:"id"`
		Snippet youtubeSnippet `json:"snippet"`
	} `json:"items"`
}

type youtubeDetailsResponse struct {
	Items []youtubeDetailsItem `json:"items"`
}

type youtubeDetailsItem struct {
	ID             string `json:"id"`
	ContentDetails struct {
		Duration string `json:"duration"`
	} `json:"contentDetails"`
	Statistics struct {
		ViewCount string `json:"viewCount"`
	} `json:"statistics"`
}

type youtubeSnippet struct {
	Title        string `json:"title"`
	ChannelTitle string `json:"channelTitle"`
	PublishedAt  string `json:"publishedAt"`
	Thumbnails   struct {
		Default struct {
			URL string `json:"url"`
		} `json:"default"`
		Medium struct {
			URL string `json:"url"`
		} `json:"medium"`
	} `json:"thumbnails"`
}

var ErrRateLimited = errors.New("rate limited")
