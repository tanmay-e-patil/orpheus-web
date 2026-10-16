package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"time"

	"github.com/jackc/pgx/v5"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"

	"orpheus-web/internal/metrics"
	"orpheus-web/internal/store"
)

type JobPublisher interface {
	Publish(context.Context, store.OutboxJob) error
}

type OutboxDispatcher struct {
	Store          *store.Store
	Publisher      JobPublisher
	LeaseDuration  time.Duration
	PublishTimeout time.Duration
	// The optional callbacks make crash boundaries deterministic in integration
	// tests. They are unset in production.
	afterPublish   func(store.OutboxJob) error
	onListen       func(uint32)
	onIdle         func()
	retryDelay     func(int) time.Duration
	reconnectDelay time.Duration
}

func (d *OutboxDispatcher) Run(ctx context.Context) error {
	for ctx.Err() == nil {
		if err := d.listenAndDispatch(ctx); err != nil && ctx.Err() == nil {
			slog.ErrorContext(ctx, "outbox listener reconnecting", "component", "outbox", "error", err)
		}
		delay := d.reconnectDelay
		if delay <= 0 {
			delay = time.Second
		}
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
	return ctx.Err()
}

func (d *OutboxDispatcher) listenAndDispatch(ctx context.Context) error {
	cfg := d.Store.Pool.Config().ConnConfig.Copy()
	cfg.ConnectTimeout = 5 * time.Second
	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		return err
	}
	defer func() {
		closeCtx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = conn.Close(closeCtx)
	}()
	if _, err := conn.Exec(ctx, "LISTEN song_jobs_ready"); err != nil {
		return err
	}
	if d.onListen != nil {
		d.onListen(conn.PgConn().PID())
	}
	// LISTEN must be committed before the initial scan, including on reconnect.
	maintenanceAt := time.Now()
	for ctx.Err() == nil {
		if !time.Now().Before(maintenanceAt) {
			if err := d.Store.PruneSongJobs(ctx, 7*24*time.Hour); err != nil {
				return err
			}
			maintenanceAt = time.Now().Add(24 * time.Hour)
		}
		if err := d.drain(ctx); err != nil {
			return err
		}
		next, err := d.Store.NextSongJobAt(ctx)
		if err != nil {
			return err
		}
		count, oldest, err := d.Store.SongJobBacklog(ctx)
		if err != nil {
			return err
		}
		metrics.OutboxPending.Set(float64(count))
		metrics.OutboxOldestCreated.Set(0)
		if oldest != nil {
			metrics.OutboxOldestCreated.Set(float64(oldest.Unix()))
		}
		deadline := maintenanceAt
		if next != nil && next.Before(deadline) {
			deadline = *next
		}
		// A row briefly locked by another transaction can be due but unclaimable.
		// Avoid a tight loop until it commits or releases its lock.
		if deadline.Before(time.Now().Add(50 * time.Millisecond)) {
			deadline = time.Now().Add(50 * time.Millisecond)
		}
		if d.onIdle != nil {
			d.onIdle()
		}
		waitCtx, cancel := context.WithDeadline(ctx, deadline)
		_, err = conn.WaitForNotification(waitCtx)
		cancel()
		if err != nil && !errors.Is(err, context.DeadlineExceeded) {
			return err
		}
	}
	return ctx.Err()
}

func (d *OutboxDispatcher) drain(ctx context.Context) error {
	lease := d.LeaseDuration
	if lease <= 0 {
		lease = 30 * time.Second
	}
	timeout := d.PublishTimeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	for ctx.Err() == nil {
		job, err := d.Store.ClaimSongJob(ctx, lease)
		if err != nil {
			return err
		}
		if job == nil {
			return nil
		}
		publishCtx := otel.GetTextMapPropagator().Extract(ctx, propagation.MapCarrier(job.TraceContext))
		publishCtx, cancel := context.WithTimeout(publishCtx, timeout)
		err = d.Publisher.Publish(publishCtx, *job)
		cancel()
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err != nil {
			delay := publicationRetryDelay(job.Attempts)
			if d.retryDelay != nil {
				delay = d.retryDelay(job.Attempts)
			}
			if _, recordErr := d.Store.RetrySongJob(ctx, *job, delay, err); recordErr != nil {
				return recordErr
			}
			slog.WarnContext(ctx, "outbox publication deferred", "component", "outbox", "event_id", job.ID, "attempt", job.Attempts, "retry_in", delay, "error", err)
			continue
		}
		if d.afterPublish != nil {
			if err := d.afterPublish(*job); err != nil {
				return err
			}
		}
		if _, err := d.Store.MarkSongJobPublished(ctx, *job); err != nil {
			return fmt.Errorf("record publication: %w", err)
		}
	}
	return ctx.Err()
}

func publicationRetryDelay(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	if attempt > 10 {
		attempt = 10
	}
	base := time.Second * time.Duration(1<<(attempt-1))
	// Full jitter with a one-second lower bound, capped at five minutes.
	if base > 5*time.Minute {
		base = 5 * time.Minute
	}
	if base == time.Second {
		return time.Second
	}
	return time.Second + time.Duration(rand.Int64N(int64(base-time.Second)))
}
