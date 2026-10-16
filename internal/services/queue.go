package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

	"orpheus-web/internal/metrics"
	"orpheus-web/internal/store"
)

const JobQueueName = "job_queue"

type QueuePublisher struct{ url string }

type JobPayload struct {
	EventID   string `json:"eventId,omitempty"`
	JobID     string `json:"jobId"`
	Action    string `json:"action"`
	Timestamp string `json:"timestamp"`
}

func NewQueuePublisher(url string) *QueuePublisher { return &QueuePublisher{url: url} }
func (q *QueuePublisher) Enabled() bool            { return q != nil && q.url != "" }

// Publish uses one connection per attempt. At this application's low job volume,
// that avoids shared-channel recovery and concurrent confirmation bookkeeping.
// A cancelled context closes the socket, including during handshake or writes.
func (q *QueuePublisher) Publish(ctx context.Context, job store.OutboxJob) error {
	return q.publish(ctx, job, JobQueueName)
}

func (q *QueuePublisher) publish(ctx context.Context, job store.OutboxJob, routingKey string) (err error) {
	if !q.Enabled() {
		return errors.New("RabbitMQ publisher is disabled")
	}
	ctx, span := otel.Tracer("orpheus-web/rabbitmq").Start(ctx, "rabbitmq publish "+JobQueueName,
		trace.WithSpanKind(trace.SpanKindProducer), trace.WithAttributes(
			attribute.String("messaging.system", "rabbitmq"),
			attribute.String("messaging.destination.name", JobQueueName),
			attribute.String("job.id", job.SongID), attribute.String("event.id", job.ID)))
	defer func() {
		result := "success"
		if err != nil {
			result = "failed"
			span.RecordError(err)
			span.SetStatus(codes.Error, "RabbitMQ publish failed")
		}
		metrics.ObserveQueuePublish(JobQueueName, result)
		span.End()
	}()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	var socket net.Conn
	var stop func() bool
	defer func() {
		if stop != nil {
			stop()
		}
		if socket != nil {
			_ = socket.Close()
		}
	}()
	conn, err := amqp.DialConfig(q.url, amqp.Config{Dial: func(network, address string) (net.Conn, error) {
		raw, err := (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, network, address)
		if err != nil {
			return nil, err
		}
		socket = raw
		stop = context.AfterFunc(ctx, func() { _ = raw.Close() })
		return raw, nil
	}})
	if err != nil {
		return fmt.Errorf("connect RabbitMQ: %w", err)
	}
	ch, err := conn.Channel()
	if err != nil {
		return err
	}
	if _, err := ch.QueueDeclare(JobQueueName, true, false, false, false, nil); err != nil {
		return err
	}
	if err := ch.Confirm(false); err != nil {
		return err
	}
	returns := ch.NotifyReturn(make(chan amqp.Return, 1))
	body, err := json.Marshal(JobPayload{EventID: job.ID, JobID: job.SongID, Action: job.Action, Timestamp: job.CreatedAt.UTC().Format(time.RFC3339Nano)})
	if err != nil {
		return err
	}
	headers := amqp.Table{"x-job-id": job.SongID, "x-song-id": job.SongID, "x-event-id": job.ID}
	otel.GetTextMapPropagator().Inject(ctx, amqpHeaderCarrier(headers))
	confirmation, err := ch.PublishWithDeferredConfirmWithContext(ctx, "", routingKey, true, false, amqp.Publishing{
		MessageId: job.ID, DeliveryMode: amqp.Persistent, ContentType: "application/json", Body: body, Headers: headers, Timestamp: job.CreatedAt,
	})
	if err != nil {
		return err
	}
	if confirmation == nil {
		return errors.New("publisher confirms are not enabled")
	}
	ack, err := confirmation.WaitContext(ctx)
	if err != nil {
		return err
	}
	if !ack {
		return errors.New("RabbitMQ rejected publication")
	}
	// RabbitMQ sends mandatory returns before the corresponding confirmation.
	select {
	case returned := <-returns:
		return fmt.Errorf("RabbitMQ returned message: %d %s", returned.ReplyCode, returned.ReplyText)
	default:
		return nil
	}
}

type amqpHeaderCarrier amqp.Table

func (c amqpHeaderCarrier) Get(key string) string { value, _ := c[key].(string); return value }
func (c amqpHeaderCarrier) Set(key, value string) { c[key] = value }
func (c amqpHeaderCarrier) Keys() []string {
	keys := make([]string, 0, len(c))
	for key := range c {
		keys = append(keys, key)
	}
	return keys
}
