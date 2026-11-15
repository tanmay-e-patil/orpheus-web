//go:build integration

package services

import (
	"context"
	"encoding/json"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"orpheus-web/internal/store"
	"orpheus-web/internal/testutil"
)

type recordingPublisher struct{ events chan store.OutboxJob }

func (p recordingPublisher) Publish(ctx context.Context, job store.OutboxJob) error {
	select {
	case p.events <- job:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

type changingPublisher struct {
	current atomic.Pointer[QueuePublisher]
}

func (p *changingPublisher) Publish(ctx context.Context, job store.OutboxJob) error {
	return p.current.Load().Publish(ctx, job)
}

func runDispatcher(t *testing.T, d *OutboxDispatcher) context.CancelFunc {
	t.Helper()
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- d.Run(ctx) }()
	t.Cleanup(func() {
		cancel()
		select {
		case err := <-done:
			if err != nil && !errors.Is(err, context.Canceled) {
				t.Error(err)
			}
		case <-time.After(10 * time.Second):
			t.Error("dispatcher did not stop")
		}
	})
	return cancel
}
func receiveEvent(t *testing.T, events <-chan store.OutboxJob) store.OutboxJob {
	t.Helper()
	select {
	case event := <-events:
		return event
	case <-time.After(5 * time.Second):
		t.Fatal("event was not published")
		return store.OutboxJob{}
	}
}
func observer(t *testing.T, url string) (*amqp.Channel, <-chan amqp.Delivery) {
	t.Helper()
	conn, err := amqp.Dial(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	ch, err := conn.Channel()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ch.QueueDeclare(JobQueueName, true, false, false, false, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := ch.QueuePurge(JobQueueName, false); err != nil {
		t.Fatal(err)
	}
	messages, err := ch.Consume(JobQueueName, "", false, false, false, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	return ch, messages
}
func receiveDelivery(t *testing.T, messages <-chan amqp.Delivery) amqp.Delivery {
	t.Helper()
	select {
	case message, ok := <-messages:
		if !ok {
			t.Fatal("delivery stream closed")
		}
		return message
	case <-time.After(10 * time.Second):
		t.Fatal("message was not delivered")
		return amqp.Delivery{}
	}
}
func waitPublished(t *testing.T, db *store.Store, n int) {
	t.Helper()
	testutil.Eventually(t, 5*time.Second, func() bool {
		var count int
		err := db.Pool.QueryRow(t.Context(), `SELECT count(*) FROM song_job_outbox WHERE published_at IS NOT NULL`).Scan(&count)
		return err == nil && count == n
	})
}

func TestNotificationDrivenOutbox(t *testing.T) {
	db, _, _ := testutil.Postgres(t)
	rabbitURL, rabbit := testutil.RabbitMQ(t)
	reset := func(t *testing.T) {
		t.Helper()
		if _, err := db.Pool.Exec(t.Context(), `TRUNCATE songs, yt_music_videos CASCADE`); err != nil {
			t.Fatal(err)
		}
		testutil.SeedSong(t, db, "Track")
	}
	t.Run("blocks when idle and wakes on commit", func(t *testing.T) {
		reset(t)
		idle := make(chan struct{}, 20)
		events := make(chan store.OutboxJob, 10)
		d := &OutboxDispatcher{Store: db, Publisher: recordingPublisher{events}, onIdle: func() { idle <- struct{}{} }}
		runDispatcher(t, d)
		select {
		case <-idle:
		case <-time.After(5 * time.Second):
			t.Fatal("listener not ready")
		}
		select {
		case <-idle:
			t.Fatal("dispatcher queried again while idle")
		case <-time.After(200 * time.Millisecond):
		}
		id, err := db.ScheduleSong(t.Context(), "Track", store.UpdateSongLyricsAction)
		if err != nil {
			t.Fatal(err)
		}
		if event := receiveEvent(t, events); event.ID != id {
			t.Fatalf("event=%s want=%s", event.ID, id)
		}
		waitPublished(t, db, 1)
	})
	t.Run("burst reaches real RabbitMQ with stable identities", func(t *testing.T) {
		reset(t)
		_, messages := observer(t, rabbitURL)
		runDispatcher(t, &OutboxDispatcher{Store: db, Publisher: NewQueuePublisher(rabbitURL)})
		wanted := map[string]bool{}
		for range 12 {
			id, err := db.ScheduleSong(t.Context(), "Track", store.UpdateSongLyricsAction)
			if err != nil {
				t.Fatal(err)
			}
			wanted[id] = true
		}
		for range 12 {
			message := receiveDelivery(t, messages)
			var body JobPayload
			if err := json.Unmarshal(message.Body, &body); err != nil {
				t.Fatal(err)
			}
			if !wanted[body.EventID] || message.MessageId != body.EventID || body.JobID != "Track" {
				t.Fatalf("unexpected event: %+v", body)
			}
			delete(wanted, body.EventID)
			if err := message.Ack(false); err != nil {
				t.Fatal(err)
			}
		}
		waitPublished(t, db, 12)
	})
	t.Run("reconnect discovers jobs committed during disconnect", func(t *testing.T) {
		reset(t)
		pids := make(chan uint32, 10)
		events := make(chan store.OutboxJob, 10)
		runDispatcher(t, &OutboxDispatcher{Store: db, Publisher: recordingPublisher{events}, onListen: func(pid uint32) { pids <- pid }, reconnectDelay: 50 * time.Millisecond})
		var pid uint32
		select {
		case pid = <-pids:
		case <-time.After(5 * time.Second):
			t.Fatal("listener not ready")
		}
		if _, err := db.Pool.Exec(t.Context(), `SELECT pg_terminate_backend($1)`, pid); err != nil {
			t.Fatal(err)
		}
		id, err := db.ScheduleSong(t.Context(), "Track", store.UpdateSongLyricsAction)
		if err != nil {
			t.Fatal(err)
		}
		if event := receiveEvent(t, events); event.ID != id {
			t.Fatal("reconnect lost event")
		}
		select {
		case next := <-pids:
			if next == pid {
				t.Fatal("listener was not replaced")
			}
		case <-time.After(5 * time.Second):
			t.Fatal("listener did not reconnect")
		}
		waitPublished(t, db, 1)
	})
	t.Run("two dispatchers claim work without duplicate active ownership", func(t *testing.T) {
		reset(t)
		events := make(chan store.OutboxJob, 30)
		for range 2 {
			runDispatcher(t, &OutboxDispatcher{Store: db, Publisher: recordingPublisher{events}})
		}
		for range 20 {
			if _, err := db.ScheduleSong(t.Context(), "Track", store.UpdateSongFilesAction); err != nil {
				t.Fatal(err)
			}
		}
		seen := map[string]bool{}
		for range 20 {
			event := receiveEvent(t, events)
			if seen[event.ID] {
				t.Fatal("duplicate active claim")
			}
			seen[event.ID] = true
		}
		waitPublished(t, db, 20)
	})
	t.Run("crash after broker confirmation retries the same event after lease expiry", func(t *testing.T) {
		reset(t)
		_, messages := observer(t, rabbitURL)
		ctx, cancel := context.WithCancel(t.Context())
		done := make(chan error, 1)
		first := &OutboxDispatcher{Store: db, Publisher: NewQueuePublisher(rabbitURL), LeaseDuration: 400 * time.Millisecond, afterPublish: func(store.OutboxJob) error { cancel(); return errors.New("simulated crash after confirmation") }}
		go func() { done <- first.Run(ctx) }()
		t.Cleanup(cancel)
		id, err := db.ScheduleSong(t.Context(), "Track", store.UpdateSongLyricsAction)
		if err != nil {
			t.Fatal(err)
		}
		original := receiveDelivery(t, messages)
		if original.MessageId != id {
			t.Fatal("wrong original event")
		}
		if err := original.Ack(false); err != nil {
			t.Fatal(err)
		}
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Fatal("crash boundary not reached")
		}
		var published bool
		if err := db.Pool.QueryRow(t.Context(), `SELECT published_at IS NOT NULL FROM song_job_outbox WHERE id=$1`, id).Scan(&published); err != nil || published {
			t.Fatal("crash recorded publication")
		}
		runDispatcher(t, &OutboxDispatcher{Store: db, Publisher: NewQueuePublisher(rabbitURL)})
		retry := receiveDelivery(t, messages)
		if retry.MessageId != id {
			t.Fatal("retry changed event ID")
		}
		if err := retry.Ack(false); err != nil {
			t.Fatal(err)
		}
		waitPublished(t, db, 1)
	})
	t.Run("mandatory return is a publication failure", func(t *testing.T) {
		reset(t)
		publisher := NewQueuePublisher(rabbitURL)
		err := publisher.publish(t.Context(), store.OutboxJob{ID: "b9121ea3-754d-4563-8b13-dd3e60ecf0f0", SongID: "Track", Action: store.UpdateSongLyricsAction, CreatedAt: time.Now()}, "missing-outbox-test-queue")
		if err == nil {
			t.Fatal("unroutable message was marked successful")
		}
	})
	t.Run("broker outage saves and recovers by timer without another request", func(t *testing.T) {
		reset(t)
		stopTimeout := time.Second
		if err := rabbit.Stop(t.Context(), &stopTimeout); err != nil {
			t.Fatal(err)
		}
		publisher := &changingPublisher{}
		publisher.current.Store(NewQueuePublisher(rabbitURL))
		runDispatcher(t, &OutboxDispatcher{Store: db, Publisher: publisher, retryDelay: func(int) time.Duration { return 150 * time.Millisecond }})
		if err := db.UpdateLyrics(t.Context(), "Track", "plain", "[00:01]saved during outage"); err != nil {
			t.Fatal(err)
		}
		testutil.Eventually(t, 5*time.Second, func() bool {
			var attempts int
			err := db.Pool.QueryRow(t.Context(), `SELECT attempts FROM song_job_outbox LIMIT 1`).Scan(&attempts)
			return err == nil && attempts > 0
		})
		if err := rabbit.Start(t.Context()); err != nil {
			t.Fatal(err)
		}
		newURL, err := rabbit.AmqpURL(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		publisher.current.Store(NewQueuePublisher(newURL))
		testutil.Eventually(t, 15*time.Second, func() bool {
			conn, err := amqp.Dial(newURL)
			if err != nil {
				return false
			}
			_ = conn.Close()
			return true
		})
		waitPublished(t, db, 1)
	})
}
