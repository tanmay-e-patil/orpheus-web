package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const discoverySearchQuery = `query SearchFull($query: String!, $firstList: Int!) {
  instantSearch(query: $query) {
    bestResult {
      ... on InstantSearchTrackBestResult { track { ...DiscoveryTrack } }
    }
    results { tracks(first: $firstList) { edges { node { ...DiscoveryTrack } } } }
  }
}
fragment DiscoveryTrack on Track {
  id title duration popularity
  album {
    displayTitle releaseDate
    cover { urls(pictureRequest: {width: 500, height: 500}) }
  }
  contributors { edges { node { ... on Artist { name } } } }
}`

var errDeezerAnonymousAuth = errors.New("deezer anonymous authentication rejected")

// Search the same catalogue interface as the website. REST remains a fallback
// when this website API is unavailable or supplies no track candidates.
func (c *DeezerClient) searchTracks(ctx context.Context, query string) ([]deezerTrack, error) {
	c.authMu.Lock()
	unavailable := time.Now().Before(c.graphQLRetryAfter)
	c.authMu.Unlock()
	if !unavailable {
		tracks, err := c.searchGraphQL(ctx, query)
		if err == nil && len(tracks) > 0 {
			return tracks, nil
		}
		if err != nil && ctx.Err() == nil {
			c.authMu.Lock()
			c.graphQLRetryAfter = time.Now().Add(30 * time.Second)
			c.authMu.Unlock()
		}
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	var response deezerSearchResponse
	if err := c.getJSON(ctx, "https://api.deezer.com/search?q="+url.QueryEscape(query)+"&limit=10", &response); err != nil {
		return nil, err
	}
	return response.Data, nil
}

func (c *DeezerClient) anonymousToken(ctx context.Context) (string, error) {
	c.authMu.Lock()
	defer c.authMu.Unlock()
	if c.anonymousJWT != "" && time.Now().Add(30*time.Second).Before(c.anonymousJWTExpiry) {
		return c.anonymousJWT, nil
	}
	var auth struct {
		JWT string `json:"jwt"`
	}
	if err := c.websiteJSON(ctx, http.MethodGet, "https://auth.deezer.com/login/anonymous?jo=p&rto=c&i=c", nil, "", &auth); err != nil {
		return "", err
	}
	// The expiry is only a refresh hint. Deezer validates the token when receiving it.
	parts := strings.Split(auth.JWT, ".")
	if len(parts) != 3 {
		return "", errors.New("deezer anonymous token is malformed")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", errors.New("deezer anonymous token is malformed")
	}
	var claims struct {
		Exp int64 `json:"exp"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil || !time.Unix(claims.Exp, 0).After(time.Now().Add(30*time.Second)) {
		return "", errors.New("deezer anonymous token has no usable expiry")
	}
	c.anonymousJWT, c.anonymousJWTExpiry = auth.JWT, time.Unix(claims.Exp, 0)
	return c.anonymousJWT, nil
}

func (c *DeezerClient) searchGraphQL(ctx context.Context, query string) ([]deezerTrack, error) {
	body, err := json.Marshal(map[string]any{"operationName": "SearchFull", "query": discoverySearchQuery, "variables": map[string]any{"query": query, "firstList": 10}})
	if err != nil {
		return nil, err
	}
	for attempt := 0; attempt < 2; attempt++ {
		token, err := c.anonymousToken(ctx)
		if err != nil {
			return nil, err
		}
		var response deezerGraphQLResponse
		err = c.websiteJSON(ctx, http.MethodPost, "https://pipe.deezer.com/api", body, token, &response)
		if err == nil && len(response.Errors) > 0 {
			err = errors.New("deezer website search returned GraphQL errors")
			for _, item := range response.Errors {
				if strings.Contains(strings.ToLower(item.Type+" "+item.Extensions.Type), "jwt") {
					err = errDeezerAnonymousAuth
					break
				}
			}
		}
		if errors.Is(err, errDeezerAnonymousAuth) && attempt == 0 {
			c.authMu.Lock()
			if c.anonymousJWT == token {
				c.anonymousJWT = ""
			}
			c.authMu.Unlock()
			continue
		}
		if err != nil {
			return nil, err
		}
		if response.Data.InstantSearch == nil {
			return nil, errors.New("deezer website search returned no payload")
		}
		result := response.Data.InstantSearch
		tracks := []deezerTrack{}
		seen := map[int]bool{}
		add := func(item *deezerGraphQLTrack) {
			if item == nil {
				return
			}
			track, ok := item.toDeezerTrack()
			if ok && !seen[track.ID] {
				seen[track.ID] = true
				tracks = append(tracks, track)
			}
		}
		add(result.BestResult.Track)
		for _, edge := range result.Results.Tracks.Edges {
			add(edge.Node)
		}
		return tracks, nil
	}
	return nil, errDeezerAnonymousAuth
}

func (c *DeezerClient) websiteJSON(ctx context.Context, method, endpoint string, body []byte, token string, dst any) error {
	req, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Origin", "https://www.deezer.com")
	req.Header.Set("Referer", "https://www.deezer.com/")
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	switch res.StatusCode {
	case http.StatusUnauthorized, http.StatusForbidden:
		return errDeezerAnonymousAuth
	case http.StatusTooManyRequests:
		return fmt.Errorf("deezer website rate limited: %w", ErrRateLimited)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("deezer website request failed: %s", res.Status)
	}
	return json.NewDecoder(res.Body).Decode(dst)
}

type deezerGraphQLTrack struct {
	ID         string   `json:"id"`
	Title      string   `json:"title"`
	Duration   int      `json:"duration"`
	Popularity *float64 `json:"popularity"`
	Album      struct {
		DisplayTitle string `json:"displayTitle"`
		ReleaseDate  string `json:"releaseDate"`
		Cover        *struct {
			URLs []string `json:"urls"`
		} `json:"cover"`
	} `json:"album"`
	Contributors struct {
		Edges []struct {
			Node struct {
				Name string `json:"name"`
			} `json:"node"`
		} `json:"edges"`
	} `json:"contributors"`
}

func (t deezerGraphQLTrack) toDeezerTrack() (deezerTrack, bool) {
	id, err := strconv.Atoi(t.ID)
	if err != nil || id <= 0 || strings.TrimSpace(t.Title) == "" {
		return deezerTrack{}, false
	}
	track := deezerTrack{ID: id, Title: t.Title, Duration: t.Duration, Popularity: t.Popularity, ReleaseDate: SanitizeDeezerDate(t.Album.ReleaseDate)}
	track.Album.Title = t.Album.DisplayTitle
	if t.Album.Cover != nil {
		for _, cover := range t.Album.Cover.URLs {
			if cover != "" {
				track.Album.CoverXL = cover
				break
			}
		}
	}
	for _, edge := range t.Contributors.Edges {
		if strings.TrimSpace(edge.Node.Name) != "" {
			track.Artist.Name = edge.Node.Name
			break
		}
	}
	return track, true
}

type deezerGraphQLResponse struct {
	Data struct {
		InstantSearch *struct {
			BestResult struct {
				Track *deezerGraphQLTrack `json:"track"`
			} `json:"bestResult"`
			Results struct {
				Tracks struct {
					Edges []struct {
						Node *deezerGraphQLTrack `json:"node"`
					} `json:"edges"`
				} `json:"tracks"`
			} `json:"results"`
		} `json:"instantSearch"`
	} `json:"data"`
	Errors []struct {
		Type       string `json:"type"`
		Extensions struct {
			Type string `json:"type"`
		} `json:"extensions"`
	} `json:"errors"`
}
