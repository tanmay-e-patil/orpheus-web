package store

import (
	"context"
	"errors"
	"time"
)

var ErrSongDeleted = errors.New("song was deleted from the shared library")

// DeleteSong hides a song and records cleanup atomically. The tombstone retains
// the outbox/cleanup foreign keys and fences old events and imports indefinitely.
func (s *Store) DeleteSong(ctx context.Context, trackID string) (bool, error) {
	defer s.songsChanged()
	defer s.playsChanged()
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	// Media workers can hold this row during a download. Bound HTTP lock waits so
	// callers can retry without partially accepting deletion.
	if _, err := tx.Exec(ctx, `SET LOCAL lock_timeout = '3s'`); err != nil {
		return false, err
	}
	var deletedAt *time.Time
	if err := tx.QueryRow(ctx, `SELECT deleted_at FROM songs WHERE id = $1 FOR UPDATE`, trackID).Scan(&deletedAt); err != nil {
		return false, err
	}
	if deletedAt != nil {
		return false, nil
	}
	// Both locations matter after a crash between a rename and its DB commit.
	// Each cleanup row represents audio plus its companion LRC, as in migration 8.
	if _, err := tx.Exec(ctx, `INSERT INTO song_file_cleanup(song_id, relative_path)
 SELECT id, path FROM songs CROSS JOIN LATERAL (
   VALUES (nullif(audio_file_path, '')), (artist_name || '/' || album_name || '/' || name || '.m4a')
 ) AS paths(path) WHERE id = $1 AND path IS NOT NULL
 ON CONFLICT DO NOTHING`, trackID); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `UPDATE songs SET deleted_at = now(), is_available = false,
 lyrics = '', synced_lyrics = '', updated_at = now() WHERE id = $1`, trackID); err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM user_song_plays WHERE track_id = $1`, trackID); err != nil {
		return false, err
	}
	if _, err := enqueueSongJob(ctx, tx, trackID, DeleteSongFilesAction); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}
