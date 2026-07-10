package services

import (
	"context"
	"testing"

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
