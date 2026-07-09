package services

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"

	"orpheus-web/internal/metrics"
)

const (
	ProcessSongAction = "process-song-data"
	JobQueueName      = "job_queue"
)

type QueuePublisher struct {
	url  string
	mu   sync.Mutex
	conn *amqp.Connection
	ch   *amqp.Channel
}

type JobPayload struct {
	JobID     string `json:"jobId"`
	Action    string `json:"action"`
	Timestamp string `json:"timestamp"`
}

func NewQueuePublisher(url string) *QueuePublisher {
	return &QueuePublisher{url: url}
}

func (q *QueuePublisher) Enabled() bool {
	return q != nil && q.url != ""
}

func (q *QueuePublisher) PublishProcessSong(ctx context.Context, trackID string) error {
	if !q.Enabled() {
		metrics.ObserveQueuePublish(JobQueueName, "disabled")
		return nil
	}
	if err := q.publishProcessSong(ctx, trackID); err != nil {
		metrics.ObserveQueuePublish(JobQueueName, "failed")
		return err
	}
	metrics.ObserveQueuePublish(JobQueueName, "success")
	return nil
}

func (q *QueuePublisher) publishProcessSong(ctx context.Context, trackID string) error {
	ch, err := q.channel()
	if err != nil {
		return err
	}
	if _, err := ch.QueueDeclare(JobQueueName, true, false, false, false, nil); err != nil {
		q.reset()
		return fmt.Errorf("declare RabbitMQ queue %s: %w", JobQueueName, err)
	}
	body, err := json.Marshal(JobPayload{
		JobID:     trackID,
		Action:    ProcessSongAction,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return err
	}
	if err := ch.PublishWithContext(ctx, "", JobQueueName, false, false, amqp.Publishing{
		DeliveryMode: amqp.Persistent,
		ContentType:  "application/json",
		Body:         body,
		Headers: amqp.Table{
			"x-job-id":  trackID,
			"x-song-id": trackID,
		},
	}); err != nil {
		q.reset()
		return fmt.Errorf("publish RabbitMQ job to %s: %w", JobQueueName, err)
	}
	return nil
}

func (q *QueuePublisher) Close() {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.ch != nil {
		_ = q.ch.Close()
	}
	if q.conn != nil {
		_ = q.conn.Close()
	}
	q.ch = nil
	q.conn = nil
}

func (q *QueuePublisher) channel() (*amqp.Channel, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.ch != nil && !q.ch.IsClosed() {
		return q.ch, nil
	}
	conn, err := amqp.Dial(q.url)
	if err != nil {
		return nil, fmt.Errorf("connect to RabbitMQ: %w", err)
	}
	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("open RabbitMQ channel: %w", err)
	}
	q.conn = conn
	q.ch = ch
	return ch, nil
}

func (q *QueuePublisher) reset() {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.ch != nil {
		_ = q.ch.Close()
	}
	if q.conn != nil {
		_ = q.conn.Close()
	}
	q.ch = nil
	q.conn = nil
}
