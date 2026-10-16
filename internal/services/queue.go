package services

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"orpheus-web/internal/metrics"
)

const (
	ProcessSongAction      = "process-song-data"
	UpdateSongFilesAction  = "update-song-files"
	UpdateSongLyricsAction = "update-song-lyrics"
	JobQueueName           = "job_queue"
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
	return q.publishSongAction(ctx, trackID, ProcessSongAction)
}

func (q *QueuePublisher) PublishUpdateSongFiles(ctx context.Context, trackID string) error {
	return q.publishSongAction(ctx, trackID, UpdateSongFilesAction)
}

func (q *QueuePublisher) PublishUpdateSongLyrics(ctx context.Context, trackID string) error {
	return q.publishSongAction(ctx, trackID, UpdateSongLyricsAction)
}

func (q *QueuePublisher) publishSongAction(ctx context.Context, trackID, action string) error {
	if !q.Enabled() {
		metrics.ObserveQueuePublish(JobQueueName, "disabled")
		return nil
	}
	if err := q.publishJob(ctx, trackID, action); err != nil {
		metrics.ObserveQueuePublish(JobQueueName, "failed")
		return err
	}
	metrics.ObserveQueuePublish(JobQueueName, "success")
	return nil
}

func (q *QueuePublisher) publishJob(ctx context.Context, trackID, action string) (err error) {
	ctx, span := otel.Tracer("orpheus-web/rabbitmq").Start(ctx, "rabbitmq publish "+JobQueueName,
		trace.WithSpanKind(trace.SpanKindProducer),
		trace.WithAttributes(
			attribute.String("messaging.system", "rabbitmq"),
			attribute.String("messaging.destination.name", JobQueueName),
			attribute.String("messaging.operation.name", "publish"),
			attribute.String("job.id", trackID),
		),
	)
	defer func() {
		if err != nil {
			span.RecordError(err)
			span.SetStatus(codes.Error, "RabbitMQ publish failed")
		}
		span.End()
	}()

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
		Action:    action,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil {
		return err
	}
	headers := amqp.Table{
		"x-job-id":  trackID,
		"x-song-id": trackID,
	}
	otel.GetTextMapPropagator().Inject(ctx, amqpHeaderCarrier(headers))
	if err = ch.PublishWithContext(ctx, "", JobQueueName, false, false, amqp.Publishing{
		DeliveryMode: amqp.Persistent,
		ContentType:  "application/json",
		Body:         body,
		Headers:      headers,
		Timestamp:    time.Now().UTC(),
	}); err != nil {
		q.reset()
		return fmt.Errorf("publish RabbitMQ job to %s: %w", JobQueueName, err)
	}
	return nil
}

type amqpHeaderCarrier amqp.Table

func (c amqpHeaderCarrier) Get(key string) string {
	value, _ := c[key].(string)
	return value
}

func (c amqpHeaderCarrier) Set(key, value string) { c[key] = value }

func (c amqpHeaderCarrier) Keys() []string {
	keys := make([]string, 0, len(c))
	for key := range c {
		keys = append(keys, key)
	}
	return keys
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
