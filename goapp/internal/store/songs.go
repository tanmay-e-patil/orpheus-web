package store

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"orpheus-goapp/internal/types"
)

const maxSongLimit = 100

type SongSort string

const (
	SongSortArtist     SongSort = "artist"
	SongSortMostPlayed SongSort = "mostPlayed"
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

	args := []any{limit + 1, opts.UserID}
	query := `
		select songs.id, songs.name, songs.artist_name, songs.album_name, songs.album_art, songs.duration, songs.yt_video_id,
		       songs.lyrics, songs.synced_lyrics, songs.is_lyrics_available, coalesce(songs.is_available, false),
		       coalesce(usp.play_count, 0)
		from songs
		left join user_song_plays usp on usp.track_id = songs.id and usp.user_id = $2
	`
	if opts.Cursor != nil {
		if opts.Sort == SongSortMostPlayed {
			query += ` where coalesce(usp.play_count, 0) < $3 or (coalesce(usp.play_count, 0) = $3 and songs.artist_name > $4) or (coalesce(usp.play_count, 0) = $3 and songs.artist_name = $4 and songs.id > $5)`
			args = append(args, opts.Cursor.PlayCount, opts.Cursor.ArtistName, opts.Cursor.TrackID)
		} else {
			query += ` where songs.artist_name > $3 or (songs.artist_name = $3 and songs.id > $4)`
			args = append(args, opts.Cursor.ArtistName, opts.Cursor.TrackID)
		}
	}
	if opts.Sort == SongSortMostPlayed {
		query += ` order by coalesce(usp.play_count, 0) desc, songs.artist_name asc, songs.id asc limit $1`
	} else {
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
			song.AudioURL = "/api/songs/" + url.PathEscape(song.TrackID) + "/audio"
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
	}
	return types.SongsPageResponse{
		Songs:        songs,
		NextCursor:   nextCursor,
		HasMore:      hasMore,
		PageRevision: types.SongPageRevision(songs),
	}, nil
}

func (s *Store) RecordSongPlay(ctx context.Context, userID, trackID string) (RecordedSongPlay, error) {
	var isAvailable bool
	err := s.Pool.QueryRow(ctx, `select coalesce(is_available, false) from songs where id = $1`, trackID).Scan(&isAvailable)
	if err != nil {
		return RecordedSongPlay{}, err
	}
	if !isAvailable {
		return RecordedSongPlay{}, ErrSongUnavailable
	}
	var play RecordedSongPlay
	play.TrackID = trackID
	err = s.Pool.QueryRow(ctx, `
		insert into user_song_plays (user_id, track_id, play_count, last_played_at, created_at, updated_at)
		values ($1, $2, 1, now(), now(), now())
		on conflict (user_id, track_id)
		do update set
		  play_count = user_song_plays.play_count + 1,
		  last_played_at = now(),
		  updated_at = now()
		returning play_count, last_played_at
	`, userID, trackID).Scan(&play.PlayCount, &play.LastPlayedAt)
	if err != nil {
		return RecordedSongPlay{}, err
	}
	return play, nil
}

func (s *Store) SongForAudio(ctx context.Context, trackID string) (types.AudioSong, error) {
	var song types.AudioSong
	err := s.Pool.QueryRow(ctx, `
		select id, name, artist_name, album_name, coalesce(is_available, false), updated_at
		from songs
		where id = $1
	`, trackID).Scan(&song.TrackID, &song.Name, &song.ArtistName, &song.AlbumName, &song.IsAvailable, &song.UpdatedAt)
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
