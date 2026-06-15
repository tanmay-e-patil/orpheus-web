package store

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"

	"orpheus-web/internal/types"
)

var releaseDatePattern = regexp.MustCompile(`^\d{4}(-\d{2}-\d{2})?$`)

var (
	ErrSameAudioSource = fmt.Errorf("same audio source")
	ErrNoAudioSource   = fmt.Errorf("no audio source")
	ErrBadReleaseDate  = fmt.Errorf("bad release date")
)

type SongEditResponse struct {
	Song               types.LibrarySong   `json:"song"`
	AudioSource        *types.YouTubeVideo `json:"audioSource,omitempty"`
	RegenerationQueued bool                `json:"regenerationQueued"`
	SongUnavailable    bool                `json:"songUnavailable"`
}

type SongMetadataUpdate struct {
	Name        string
	ArtistName  string
	AlbumName   string
	AlbumArt    string
	ReleaseDate string
}

type PublishSongFunc func(context.Context, string) error

func (s *Store) FetchLibrarySong(ctx context.Context, userID, trackID string) (types.LibrarySong, *types.YouTubeVideo, error) {
	row := s.Pool.QueryRow(ctx, librarySongSelect()+`
		where songs.id = $1
	`, trackID, userID)
	return scanLibrarySongWithSource(row)
}

func (s *Store) UpdateSongMetadata(ctx context.Context, userID, trackID string, in SongMetadataUpdate, queueEnabled bool, publish PublishSongFunc) (SongEditResponse, error) {
	releaseDate, err := normalizeReleaseDate(in.ReleaseDate)
	if err != nil {
		return SongEditResponse{}, err
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return SongEditResponse{}, err
	}
	defer tx.Rollback(ctx)

	var currentAlbumArt string
	err = tx.QueryRow(ctx, `select album_art from songs where id = $1 for update`, trackID).Scan(&currentAlbumArt)
	if err != nil {
		return SongEditResponse{}, err
	}
	regen := currentAlbumArt != in.AlbumArt
	args := []any{in.Name, in.ArtistName, in.AlbumName, in.AlbumArt, regen, trackID}
	query := `update songs set name = $1, artist_name = $2, album_name = $3, album_art = $4, is_available = case when $5 then false else is_available end, updated_at = now()`
	if releaseDate != "" {
		args = append(args, releaseDate)
		query += fmt.Sprintf(`, release_date = $%d::date, release_year = left($%d, 4)`, len(args), len(args))
	}
	query += ` where id = $6`
	if _, err := tx.Exec(ctx, query, args...); err != nil {
		return SongEditResponse{}, err
	}
	if regen && queueEnabled {
		if publish == nil {
			return SongEditResponse{}, fmt.Errorf("publish function missing")
		}
		if err := publish(ctx, trackID); err != nil {
			return SongEditResponse{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return SongEditResponse{}, err
	}
	song, source, err := s.FetchLibrarySong(ctx, userID, trackID)
	if err != nil {
		return SongEditResponse{}, err
	}
	return SongEditResponse{Song: song, AudioSource: source, RegenerationQueued: regen && queueEnabled, SongUnavailable: regen}, nil
}

func (s *Store) ReplaceAudioSource(ctx context.Context, userID, trackID string, video types.YouTubeVideo, queueEnabled bool, publish PublishSongFunc) (SongEditResponse, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return SongEditResponse{}, err
	}
	defer tx.Rollback(ctx)

	var currentID string
	if err := tx.QueryRow(ctx, `select yt_video_id from songs where id = $1 for update`, trackID).Scan(&currentID); err != nil {
		return SongEditResponse{}, err
	}
	if currentID == video.ID {
		return SongEditResponse{}, ErrSameAudioSource
	}
	if err := upsertVideoTx(ctx, tx, video); err != nil {
		return SongEditResponse{}, err
	}
	var duration any
	if video.Duration != nil && *video.Duration != "" {
		duration = *video.Duration
	}
	_, err = tx.Exec(ctx, `
		update songs
		set yt_video_id = $1,
		    duration = coalesce($2, duration),
		    is_available = false,
		    updated_at = now()
		where id = $3
	`, video.ID, duration, trackID)
	if err != nil {
		return SongEditResponse{}, err
	}
	if queueEnabled {
		if publish == nil {
			return SongEditResponse{}, fmt.Errorf("publish function missing")
		}
		if err := publish(ctx, trackID); err != nil {
			return SongEditResponse{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return SongEditResponse{}, err
	}
	song, source, err := s.FetchLibrarySong(ctx, userID, trackID)
	if err != nil {
		return SongEditResponse{}, err
	}
	return SongEditResponse{Song: song, AudioSource: source, RegenerationQueued: queueEnabled, SongUnavailable: true}, nil
}

func (s *Store) RegenerateSong(ctx context.Context, userID, trackID string, queueEnabled bool, publish PublishSongFunc) (SongEditResponse, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return SongEditResponse{}, err
	}
	defer tx.Rollback(ctx)
	var videoID string
	if err := tx.QueryRow(ctx, `select yt_video_id from songs where id = $1 for update`, trackID).Scan(&videoID); err != nil {
		return SongEditResponse{}, err
	}
	if videoID == "" {
		return SongEditResponse{}, ErrNoAudioSource
	}
	if _, err := tx.Exec(ctx, `update songs set is_available = false, updated_at = now() where id = $1`, trackID); err != nil {
		return SongEditResponse{}, err
	}
	if queueEnabled {
		if publish == nil {
			return SongEditResponse{}, fmt.Errorf("publish function missing")
		}
		if err := publish(ctx, trackID); err != nil {
			return SongEditResponse{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return SongEditResponse{}, err
	}
	song, source, err := s.FetchLibrarySong(ctx, userID, trackID)
	if err != nil {
		return SongEditResponse{}, err
	}
	return SongEditResponse{Song: song, AudioSource: source, RegenerationQueued: queueEnabled, SongUnavailable: true}, nil
}

func normalizeReleaseDate(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	if !releaseDatePattern.MatchString(value) {
		return "", ErrBadReleaseDate
	}
	if len(value) == 4 {
		return value + "-01-01", nil
	}
	return value, nil
}

func librarySongSelect() string {
	return `
		select songs.id, songs.name, songs.artist_name, songs.album_name, songs.album_art, songs.duration, songs.yt_video_id,
		       songs.lyrics, songs.synced_lyrics, songs.is_lyrics_available, coalesce(songs.is_available, false),
		       coalesce(usp.play_count, 0),
		       yt_music_videos.id, yt_music_videos.title, yt_music_videos.thumbnail, yt_music_videos.channel_title,
		       yt_music_videos.published_at, yt_music_videos.duration, yt_music_videos.view_count
		from songs
		left join user_song_plays usp on usp.track_id = songs.id and usp.user_id = $2
		left join yt_music_videos on yt_music_videos.id = songs.yt_video_id
	`
}

type rowScanner interface{ Scan(dest ...any) error }

func scanLibrarySongWithSource(row rowScanner) (types.LibrarySong, *types.YouTubeVideo, error) {
	var song types.LibrarySong
	var lyrics, syncedLyrics sql.NullString
	var isLyrics sql.NullBool
	var vidID, title, thumb, channel, published, duration, views sql.NullString
	if err := row.Scan(&song.TrackID, &song.Name, &song.ArtistName, &song.AlbumName, &song.AlbumArt, &song.Duration, &song.YoutubeVideoID, &lyrics, &syncedLyrics, &isLyrics, &song.IsAvailable, &song.PlayCount, &vidID, &title, &thumb, &channel, &published, &duration, &views); err != nil {
		return types.LibrarySong{}, nil, err
	}
	if lyrics.Valid {
		song.Lyrics = lyrics.String
	}
	if syncedLyrics.Valid {
		song.SyncedLyrics = syncedLyrics.String
	}
	if isLyrics.Valid {
		v := isLyrics.Bool
		song.IsLyricsAvailable = &v
	}
	if song.IsAvailable {
		song.AudioURL = "/api/songs/" + url.PathEscape(song.TrackID) + "/audio"
	}
	if !vidID.Valid {
		return song, nil, nil
	}
	video := &types.YouTubeVideo{ID: vidID.String, Title: title.String, Thumbnail: thumb.String, ChannelTitle: channel.String, PublishedAt: published.String}
	if duration.Valid {
		v := duration.String
		video.Duration = &v
	}
	if views.Valid {
		v := views.String
		video.ViewCount = &v
	}
	return song, video, nil
}

func upsertVideoTx(ctx context.Context, tx pgx.Tx, video types.YouTubeVideo) error {
	var duration, viewCount any
	if video.Duration != nil {
		duration = *video.Duration
	}
	if video.ViewCount != nil {
		viewCount = *video.ViewCount
	}
	_, err := tx.Exec(ctx, `
		insert into yt_music_videos (id, title, thumbnail, channel_title, published_at, duration, view_count)
		values ($1, $2, $3, $4, $5, $6, $7)
		on conflict (id) do update set
		  title = excluded.title,
		  thumbnail = excluded.thumbnail,
		  channel_title = excluded.channel_title,
		  published_at = excluded.published_at,
		  duration = excluded.duration,
		  view_count = excluded.view_count
	`, video.ID, video.Title, video.Thumbnail, video.ChannelTitle, video.PublishedAt, duration, viewCount)
	return err
}
