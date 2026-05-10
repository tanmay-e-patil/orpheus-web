package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"orpheus-goapp/internal/types"
)

const maxSongLimit = 100

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

func (s *Store) FetchSongsPage(ctx context.Context, cursor *types.SongCursor, limit int) (types.SongsPageResponse, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > maxSongLimit {
		limit = maxSongLimit
	}

	args := []any{limit + 1}
	query := `
		select id, name, artist_name, album_name, album_art, duration, yt_video_id,
		       lyrics, synced_lyrics, is_lyrics_available
		from songs
	`
	if cursor != nil {
		query += ` where artist_name > $2 or (artist_name = $2 and id > $3)`
		args = append(args, cursor.ArtistName, cursor.TrackID)
	}
	query += ` order by artist_name asc, id asc limit $1`

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
		nextCursor = &types.SongCursor{ArtistName: last.ArtistName, TrackID: last.TrackID}
	}
	return types.SongsPageResponse{
		Songs:        songs,
		NextCursor:   nextCursor,
		HasMore:      hasMore,
		PageRevision: types.SongPageRevision(songs),
	}, nil
}

func (s *Store) SongsForAlbumRefresh(ctx context.Context, trackIDs []string) ([]types.LibrarySong, error) {
	if len(trackIDs) == 0 {
		return nil, nil
	}
	rows, err := s.Pool.Query(ctx, `
		select id, name, artist_name, album_name, album_art, duration, yt_video_id
		from songs
		where id = any($1)
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
	var predicates []string
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

func (s *Store) UpdateAlbumArt(ctx context.Context, trackID, albumArt string) error {
	tag, err := s.Pool.Exec(ctx, `update songs set album_art = $1, updated_at = now() where id = $2`, albumArt, trackID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("song not found: %s", trackID)
	}
	return nil
}

func (s *Store) UpdateLyrics(ctx context.Context, trackID, plainLyrics, syncedLyrics string) error {
	isAvailable := plainLyrics != "" || syncedLyrics != ""
	tag, err := s.Pool.Exec(ctx, `
		update songs
		set lyrics = $1, synced_lyrics = $2, is_lyrics_available = $3, updated_at = now()
		where id = $4
	`, plainLyrics, syncedLyrics, isAvailable, trackID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
