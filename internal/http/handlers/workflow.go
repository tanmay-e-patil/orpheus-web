package handlers

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"orpheus-web/internal/store"
	"orpheus-web/internal/types"
)

const retryableCommitError = "Something went wrong while saving this track. Please try again."

func CommitWorkflow(db *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body types.CommitRequest
		if err := DecodeJSON(r, &body); err != nil {
			Error(w, http.StatusBadRequest, "bad_request", "Invalid commit request")
			return
		}
		results := make([]types.CommitResult, 0, len(body.Items))
		for _, item := range body.Items {
			trackID := firstNonEmpty(item.Song.ID, item.Edits.TrackName)
			if item.Song.ID != "" {
				trackID = item.Song.ID
			}
			result := types.CommitResult{TrackID: trackID}
			upsert, err := commitItemToSong(item)
			if err != nil {
				result.Error = err.Error()
				results = append(results, result)
				continue
			}
			if err := db.UpsertSongAndVideo(r.Context(), upsert, item.Video); err != nil {
				slog.ErrorContext(r.Context(), "commit store failed", "component", "workflow", "track_id", upsert.TrackID, "error", err)
				result.Error = retryableCommitError
				if errors.Is(err, store.ErrSongDeleted) {
					result.Error = "This song was deleted from the shared library and cannot be re-imported."
					result.Code = "song_deleted"
				}
				results = append(results, result)
				continue
			}

			slog.InfoContext(r.Context(), "song processing scheduled", "component", "workflow", "track_id", upsert.TrackID)
			result.TrackID = upsert.TrackID
			result.Success = true
			results = append(results, result)
		}
		JSON(w, http.StatusOK, types.CommitResponse{Results: results})
	}
}

func commitItemToSong(item types.CommitItem) (types.SongUpsert, error) {
	plainLyrics, syncedLyrics := "", ""
	if item.LyricsSearchResult != nil && item.LyricsSearchResult.SelectedOption != nil {
		plainLyrics = item.LyricsSearchResult.SelectedOption.PlainLyrics
		syncedLyrics = item.LyricsSearchResult.SelectedOption.SyncedLyrics
	}
	if item.Edits.Lyrics != "" {
		plainLyrics = item.Edits.Lyrics
	}
	if item.Edits.SyncedLyrics != "" {
		syncedLyrics = item.Edits.SyncedLyrics
	}

	releaseDate := normalizeReleaseDate(firstNonEmpty(item.Edits.ReleaseDate, item.Song.ReleaseDate))
	releaseYear := "Unknown"
	if len(releaseDate) >= 4 {
		releaseYear = releaseDate[:4]
	}

	duration := firstNonEmpty(item.Edits.TrackDuration, stringValue(item.Video.Duration), "00:00")
	song := types.SongUpsert{
		TrackID:           item.Song.ID,
		Name:              firstNonEmpty(item.Edits.TrackName, item.Song.Name),
		ArtistName:        firstNonEmpty(item.Edits.ArtistName, item.Song.Artist),
		AlbumName:         firstNonEmpty(item.Edits.AlbumName, item.Song.Album),
		AlbumArt:          firstNonEmpty(item.Edits.AlbumArt, item.Song.AlbumImageURL),
		Lyrics:            plainLyrics,
		SyncedLyrics:      syncedLyrics,
		IsLyricsAvailable: plainLyrics != "" || syncedLyrics != "",
		Duration:          duration,
		YoutubeVideoID:    item.Video.ID,
		IsAvailable:       false,
		ReleaseDate:       releaseDate,
		ReleaseYear:       releaseYear,
	}
	if song.TrackID == "" {
		return song, errString("song id required")
	}
	if song.Name == "" {
		return song, errString("track name required")
	}
	if song.ArtistName == "" {
		return song, errString("artist name required")
	}
	if song.AlbumName == "" {
		return song, errString("album name required")
	}
	if song.YoutubeVideoID == "" {
		return song, errString("youtube video id required")
	}
	if song.ReleaseDate == "" {
		song.ReleaseDate = "1970-01-01"
		song.ReleaseYear = "1970"
	}
	return song, nil
}

type errString string

func (e errString) Error() string { return string(e) }

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func normalizeReleaseDate(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if len(value) == 4 {
		return value + "-01-01"
	}
	return value
}
