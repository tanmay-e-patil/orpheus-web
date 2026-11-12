package store

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strings"
	"time"

	"orpheus-web/internal/types"
)

const maxSongLimit = 100

type SongSort string

const (
	SongSortArtist        SongSort = "artist"
	SongSortMostPlayed    SongSort = "mostPlayed"
	SongSortRecentlyAdded SongSort = "recentlyAdded"
)

type FetchSongsOptions struct {
	UserID string
	Cursor *types.SongCursor
	Limit  int
	Sort   SongSort
}

type RecordedSongPlay struct {
	TrackID      string    `json:"trackId"`
	PlayCount    int       `json:"playCount"`
	LastPlayedAt time.Time `json:"lastPlayedAt"`
}

var ErrSongUnavailable = fmt.Errorf("song unavailable")

type RedownloadSongsFilter struct {
	IncludeAvailable bool
	UpdatedAfter     *time.Time
	UpdatedBefore    *time.Time
	Limit            int
}

type RedownloadSong struct {
	TrackID    string
	Name       string
	ArtistName string
}

func (s *Store) FetchSongsPage(ctx context.Context, opts FetchSongsOptions) (types.SongsPageResponse, error) {
	limit := opts.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > maxSongLimit {
		limit = maxSongLimit
	}
	if s.Library != nil {
		if page, ok := s.Library.page(ctx, opts, limit); ok {
			return page, nil
		}
	}

	args := []any{limit + 1, opts.UserID}
	query := `
		select songs.id, songs.name, songs.artist_name, songs.album_name, songs.album_art, songs.duration, songs.yt_video_id,
		       songs.lyrics, songs.synced_lyrics, songs.is_lyrics_available, coalesce(songs.is_available, false),
		       coalesce(usp.play_count, 0), songs.created_at
		from songs
		left join user_song_plays usp on usp.track_id = songs.id and usp.user_id = $2
		where songs.deleted_at IS NULL
	`
	if opts.Cursor != nil {
		switch opts.Sort {
		case SongSortMostPlayed:
			query += ` AND (coalesce(usp.play_count, 0) < $3 or (coalesce(usp.play_count, 0) = $3 and songs.artist_name > $4) or (coalesce(usp.play_count, 0) = $3 and songs.artist_name = $4 and songs.id > $5))`
			args = append(args, opts.Cursor.PlayCount, opts.Cursor.ArtistName, opts.Cursor.TrackID)
		case SongSortRecentlyAdded:
			query += ` AND (songs.created_at < $3 or (songs.created_at = $3 and songs.id > $4))`
			args = append(args, opts.Cursor.CreatedAt, opts.Cursor.TrackID)
		default:
			query += ` AND (songs.artist_name, songs.id) > ($3, $4)`
			args = append(args, opts.Cursor.ArtistName, opts.Cursor.TrackID)
		}
	}
	switch opts.Sort {
	case SongSortMostPlayed:
		query += ` order by coalesce(usp.play_count, 0) desc, songs.artist_name asc, songs.id asc limit $1`
	case SongSortRecentlyAdded:
		query += ` order by songs.created_at desc, songs.id asc limit $1`
	default:
		query += ` order by songs.artist_name asc, songs.id asc limit $1`
	}

	rows, err := s.Pool.Query(ctx, query, args...)
	if err != nil {
		return types.SongsPageResponse{}, err
	}
	defer rows.Close()

	songs := make([]types.LibrarySong, 0, limit)
	for rows.Next() {
		var song types.LibrarySong
		var lyrics, syncedLyrics sql.NullString
		var isLyrics sql.NullBool
		if err := rows.Scan(
			&song.TrackID,
			&song.Name,
			&song.ArtistName,
			&song.AlbumName,
			&song.AlbumArt,
			&song.Duration,
			&song.YoutubeVideoID,
			&lyrics,
			&syncedLyrics,
			&isLyrics,
			&song.IsAvailable,
			&song.PlayCount,
			&song.CreatedAt,
		); err != nil {
			return types.SongsPageResponse{}, err
		}
		if lyrics.Valid {
			song.Lyrics = lyrics.String
		}
		if syncedLyrics.Valid {
			song.SyncedLyrics = syncedLyrics.String
		}
		if isLyrics.Valid {
			value := isLyrics.Bool
			song.IsLyricsAvailable = &value
		}
		if song.IsAvailable {
			song.AudioURL = librarySongAudioURL(song.TrackID, song.YoutubeVideoID)
		}
		songs = append(songs, song)
	}
	if err := rows.Err(); err != nil {
		return types.SongsPageResponse{}, err
	}

	hasMore := len(songs) > limit
	if hasMore {
		songs = songs[:limit]
	}
	var nextCursor *types.SongCursor
	if hasMore && len(songs) > 0 {
		last := songs[len(songs)-1]
		nextCursor = &types.SongCursor{ArtistName: last.ArtistName, TrackID: last.TrackID, PlayCount: last.PlayCount}
		if opts.Sort == SongSortRecentlyAdded {
			nextCursor.CreatedAt = &last.CreatedAt
		}
	}
	return types.SongsPageResponse{
		Songs:        songs,
		NextCursor:   nextCursor,
		HasMore:      hasMore,
		PageRevision: types.SongPageRevision(songs),
	}, nil
}

func librarySongAudioURL(trackID, revision string) string {
	path := "/api/songs/" + url.PathEscape(trackID) + "/audio"
	if revision == "" {
		return path
	}
	return path + "?v=" + url.QueryEscape(revision)
}

// RecordSongPlay is a single round trip. FOR KEY SHARE serializes with
// DeleteSong's FOR UPDATE (so a play cannot resurrect a deleted song's row)
// without blocking on media workers' ordinary row updates.
func (s *Store) RecordSongPlay(ctx context.Context, userID, trackID string) (RecordedSongPlay, error) {
	defer s.playsChanged()
	var isAvailable bool
	var playCount *int
	var lastPlayedAt *time.Time
	err := s.Pool.QueryRow(ctx, `
		with song as (
			select id, coalesce(is_available, false) as is_available
			from songs where id = $2 and deleted_at is null
			for key share
		), play as (
			insert into user_song_plays (user_id, track_id, play_count, last_played_at, created_at, updated_at)
			select $1, id, 1, now(), now(), now() from song where is_available
			on conflict (user_id, track_id)
			do update set
			  play_count = user_song_plays.play_count + 1,
			  last_played_at = now(),
			  updated_at = now()
			returning play_count, last_played_at
		)
		select song.is_available, play.play_count, play.last_played_at
		from song left join play on true
	`, userID, trackID).Scan(&isAvailable, &playCount, &lastPlayedAt)
	if err != nil {
		return RecordedSongPlay{}, err
	}
	if !isAvailable || playCount == nil || lastPlayedAt == nil {
		return RecordedSongPlay{}, ErrSongUnavailable
	}
	return RecordedSongPlay{TrackID: trackID, PlayCount: *playCount, LastPlayedAt: *lastPlayedAt}, nil
}

func (s *Store) SongForAudio(ctx context.Context, trackID string) (types.AudioSong, error) {
	var song types.AudioSong
	err := s.Pool.QueryRow(ctx, `
		select id, name, artist_name, album_name, coalesce(is_available, false), updated_at, coalesce(audio_file_path, '')
		from songs
		where id = $1 AND deleted_at IS NULL
	`, trackID).Scan(&song.TrackID, &song.Name, &song.ArtistName, &song.AlbumName, &song.IsAvailable, &song.UpdatedAt, &song.AudioFilePath)
	if err != nil {
		return types.AudioSong{}, err
	}
	return song, nil
}

func (s *Store) SongsForAlbumRefresh(ctx context.Context, trackIDs []string) ([]types.LibrarySong, error) {
	if len(trackIDs) == 0 {
		return nil, nil
	}
	rows, err := s.Pool.Query(ctx, `
		select id, name, artist_name, album_name, album_art, duration, yt_video_id
		from songs
		where id = any($1) AND deleted_at IS NULL
	`, trackIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var songs []types.LibrarySong
	for rows.Next() {
		var song types.LibrarySong
		if err := rows.Scan(&song.TrackID, &song.Name, &song.ArtistName, &song.AlbumName, &song.AlbumArt, &song.Duration, &song.YoutubeVideoID); err != nil {
			return nil, err
		}
		songs = append(songs, song)
	}
	return songs, rows.Err()
}

func (s *Store) RedownloadSongIDs(ctx context.Context, filter RedownloadSongsFilter) ([]string, error) {
	songs, err := s.RedownloadSongs(ctx, filter)
	if err != nil {
		return nil, err
	}
	trackIDs := make([]string, 0, len(songs))
	for _, song := range songs {
		trackIDs = append(trackIDs, song.TrackID)
	}
	return trackIDs, nil
}

func (s *Store) RedownloadSongs(ctx context.Context, filter RedownloadSongsFilter) ([]RedownloadSong, error) {
	query, args := buildRedownloadSongsQuery(filter)
	rows, err := s.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var songs []RedownloadSong
	for rows.Next() {
		var song RedownloadSong
		if err := rows.Scan(&song.TrackID, &song.Name, &song.ArtistName); err != nil {
			return nil, err
		}
		songs = append(songs, song)
	}
	return songs, rows.Err()
}

func buildRedownloadSongsQuery(filter RedownloadSongsFilter) (string, []any) {
	var args []any
	predicates := []string{"deleted_at IS NULL"}
	if !filter.IncludeAvailable {
		predicates = append(predicates, "coalesce(is_available, false) = false")
	}
	if filter.UpdatedAfter != nil {
		args = append(args, *filter.UpdatedAfter)
		predicates = append(predicates, fmt.Sprintf("updated_at >= $%d", len(args)))
	}
	if filter.UpdatedBefore != nil {
		args = append(args, *filter.UpdatedBefore)
		predicates = append(predicates, fmt.Sprintf("updated_at <= $%d", len(args)))
	}

	var query strings.Builder
	query.WriteString("select id, name, artist_name from songs")
	if len(predicates) > 0 {
		query.WriteString(" where ")
		query.WriteString(strings.Join(predicates, " and "))
	}
	query.WriteString(" order by updated_at asc, id asc")
	if filter.Limit > 0 {
		args = append(args, filter.Limit)
		query.WriteString(fmt.Sprintf(" limit $%d", len(args)))
	}
	return query.String(), args
}

// updateSongFileMetadata records file work in the same transaction as the edit.
func (s *Store) updateSongFileMetadata(ctx context.Context, trackID, query string, args []any, action string) error {
	defer s.songsChanged()
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var id string
	if err := tx.QueryRow(ctx, `select id from songs where id = $1 AND deleted_at IS NULL for update`, trackID).Scan(&id); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, query, args...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() > 0 {
		if _, err := enqueueSongJob(ctx, tx, trackID, action); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) UpdateAlbumArt(ctx context.Context, trackID, albumArt string) error {
	return s.updateSongFileMetadata(ctx, trackID, `update songs set album_art = $1, updated_at = now() where id = $2 and album_art is distinct from $1`, []any{albumArt, trackID}, UpdateSongFilesAction)
}

func (s *Store) UpdateLyrics(ctx context.Context, trackID, plainLyrics, syncedLyrics string) error {
	isAvailable := plainLyrics != "" || syncedLyrics != ""
	return s.updateSongFileMetadata(ctx, trackID, `
  update songs set lyrics = $1, synced_lyrics = $2, is_lyrics_available = $3, updated_at = now()
  where id = $4 and (lyrics is distinct from $1 or synced_lyrics is distinct from $2 or is_lyrics_available is distinct from $3)
 `, []any{plainLyrics, syncedLyrics, isAvailable, trackID}, UpdateSongLyricsAction)
}
