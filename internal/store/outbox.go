package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

const (
	DeleteSongFilesAction  = "delete-song-files"
	ProcessSongAction      = "process-song-data"
	UpdateSongFilesAction  = "update-song-files"
	UpdateSongLyricsAction = "update-song-lyrics"
)

type OutboxJob struct {
	ID           string
	SongID       string
	Action       string
	CreatedAt    time.Time
	Attempts     int
	LeaseToken   string
	TraceContext map[string]string
}

// enqueueSongJob must use the transaction that owns the song change. The table
// trigger emits a wake-up only when that transaction commits.
func enqueueSongJob(ctx context.Context, tx pgx.Tx, songID, action string) (string, error) {
	carrier := propagation.MapCarrier{}
	otel.GetTextMapPropagator().Inject(ctx, carrier)
	var id string
	err := tx.QueryRow(ctx, `INSERT INTO song_job_outbox (song_id, action, trace_context)
		VALUES ($1, $2, $3) RETURNING id::text`, songID, action, map[string]string(carrier)).Scan(&id)
	return id, err
}

// ScheduleSong records an explicit processing request, including CLI requests,
// without requiring RabbitMQ to be available.
func (s *Store) ScheduleSong(ctx context.Context, songID, action string) (string, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	var activeID string
	if err := tx.QueryRow(ctx, `SELECT id FROM songs WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, songID).Scan(&activeID); err != nil {
		return "", err
	}
	id, err := enqueueSongJob(ctx, tx, songID, action)
	if err != nil {
		return "", err
	}
	return id, tx.Commit(ctx)
}

func (s *Store) ClaimSongJob(ctx context.Context, lease time.Duration) (*OutboxJob, error) {
	var job OutboxJob
	err := s.Pool.QueryRow(ctx, `WITH candidate AS (
		SELECT id FROM song_job_outbox
		WHERE published_at IS NULL AND completed_at IS NULL AND available_at <= now()
		  AND (lease_until IS NULL OR lease_until <= now())
		ORDER BY available_at, created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
	)
	UPDATE song_job_outbox o SET lease_token = gen_random_uuid(),
		lease_until = now() + $1 * interval '1 second', attempts = attempts + 1
	FROM candidate WHERE o.id = candidate.id
	RETURNING o.id::text, song_id, action, created_at, attempts, lease_token::text, trace_context`, lease.Seconds()).Scan(
		&job.ID, &job.SongID, &job.Action, &job.CreatedAt, &job.Attempts, &job.LeaseToken, &job.TraceContext)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &job, nil
}

func (s *Store) MarkSongJobPublished(ctx context.Context, job OutboxJob) (bool, error) {
	tag, err := s.Pool.Exec(ctx, `UPDATE song_job_outbox SET published_at = now(),
		lease_token = NULL, lease_until = NULL, last_error = NULL
		WHERE id = $1 AND lease_token = $2 AND published_at IS NULL`, job.ID, job.LeaseToken)
	return tag.RowsAffected() == 1, err
}

func (s *Store) RetrySongJob(ctx context.Context, job OutboxJob, delay time.Duration, failure error) (bool, error) {
	tag, err := s.Pool.Exec(ctx, `UPDATE song_job_outbox
		SET available_at = now() + $3 * interval '1 second', last_error = left($4, 4000),
		lease_token = NULL, lease_until = NULL
		WHERE id = $1 AND lease_token = $2 AND published_at IS NULL AND completed_at IS NULL`,
		job.ID, job.LeaseToken, delay.Seconds(), failure.Error())
	return tag.RowsAffected() == 1, err
}

// NextSongJobAt includes other dispatchers' leases so a failed worker is recovered
// at its lease deadline even when no new notification arrives.
func (s *Store) NextSongJobAt(ctx context.Context) (*time.Time, error) {
	var at *time.Time
	err := s.Pool.QueryRow(ctx, `SELECT min(greatest(available_at, coalesce(lease_until, available_at)))
		FROM song_job_outbox WHERE published_at IS NULL AND completed_at IS NULL`).Scan(&at)
	return at, err
}

func (s *Store) SongJobBacklog(ctx context.Context) (count int, oldest *time.Time, err error) {
	err = s.Pool.QueryRow(ctx, `SELECT count(*), min(created_at) FROM song_job_outbox
		WHERE published_at IS NULL AND completed_at IS NULL`).Scan(&count, &oldest)
	return
}

// Retain completion receipts for the replay window. Unfinished jobs never expire.
func (s *Store) PruneSongJobs(ctx context.Context, retention time.Duration) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM song_job_outbox WHERE id IN (
		SELECT id FROM song_job_outbox WHERE completed_at < now() - $1 * interval '1 second'
 AND NOT EXISTS (SELECT 1 FROM song_file_cleanup c WHERE c.song_id = song_job_outbox.song_id)
		ORDER BY completed_at LIMIT 1000 FOR UPDATE SKIP LOCKED)`, retention.Seconds())
	return err
}

// DeletionBacklog includes published jobs waiting for the consumer or DLQ repair.
func (s *Store) DeletionBacklog(ctx context.Context) (count int, oldest *time.Time, err error) {
	err = s.Pool.QueryRow(ctx, `SELECT count(*), min(created_at) FROM song_job_outbox
 WHERE action = 'delete-song-files' AND completed_at IS NULL`).Scan(&count, &oldest)
	return
}
