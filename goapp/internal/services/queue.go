package services

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
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

func (q *QueuePublisher) PublishProcessSong(ctx context.Context, trackID string) error {
	if q == nil || q.url == "" {
		return nil
	}
	ch, err := q.channel()
	if err != nil {
		return err
	}
	if _, err := ch.QueueDeclare("job_queue", true, false, false, false, nil); err != nil {
		q.reset()
		return err
	}
	body, err := json.Marshal(JobPayload{
		JobID:     trackID,
		Action:    "process-song-data",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return err
	}
	if err := ch.PublishWithContext(ctx, "", "job_queue", false, false, amqp.Publishing{
		DeliveryMode: amqp.Persistent,
		ContentType:  "application/json",
		Body:         body,
	}); err != nil {
		q.reset()
		return err
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
		return nil, err
	}
	ch, err := conn.Channel()
	if err != nil {
		_ = conn.Close()
		return nil, err
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
