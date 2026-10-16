package services

import (
	"context"
	"net"
	"orpheus-web/internal/store"
	"testing"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

func TestAMQPHeaderCarrierPropagatesTraceContext(t *testing.T) {
	traceID, _ := trace.TraceIDFromHex("0102030405060708090a0b0c0d0e0f10")
	spanID, _ := trace.SpanIDFromHex("0102030405060708")
	ctx := trace.ContextWithSpanContext(context.Background(), trace.NewSpanContext(trace.SpanContextConfig{
		TraceID:    traceID,
		SpanID:     spanID,
		TraceFlags: trace.FlagsSampled,
		Remote:     true,
	}))
	headers := amqp.Table{"x-job-id": "song-1"}
	carrier := amqpHeaderCarrier(headers)
	propagator := propagation.TraceContext{}
	propagator.Inject(ctx, carrier)

	extracted := trace.SpanContextFromContext(propagator.Extract(context.Background(), carrier))
	if extracted.TraceID() != traceID || extracted.SpanID() != spanID {
		t.Fatalf("extracted span context = %s/%s", extracted.TraceID(), extracted.SpanID())
	}
	if headers["x-job-id"] != "song-1" {
		t.Fatal("existing header was changed")
	}
}

func TestPublisherCancellationInterruptsStalledHandshake(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	accepted := make(chan net.Conn, 1)
	go func() {
		conn, err := listener.Accept()
		if err == nil {
			accepted <- conn
		}
	}()
	ctx, cancel := context.WithTimeout(t.Context(), 100*time.Millisecond)
	defer cancel()
	started := time.Now()
	err = NewQueuePublisher("amqp://test:test@"+listener.Addr().String()+"/").Publish(ctx, store.OutboxJob{})
	if err == nil {
		t.Fatal("stalled handshake succeeded")
	}
	if time.Since(started) > time.Second {
		t.Fatal("context cancellation did not interrupt handshake")
	}
	select {
	case conn := <-accepted:
		_ = conn.Close()
	case <-time.After(time.Second):
		t.Fatal("publisher never connected")
	}
}
