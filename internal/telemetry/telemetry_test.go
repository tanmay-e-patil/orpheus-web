package telemetry

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	tracesdk "go.opentelemetry.io/otel/sdk/trace"
)

func TestTraceHandlerAddsTraceContext(t *testing.T) {
	provider := tracesdk.NewTracerProvider(tracesdk.WithSampler(tracesdk.AlwaysSample()))
	ctx, span := provider.Tracer("test").Start(context.Background(), "test")
	defer span.End()

	var output bytes.Buffer
	logger := slog.New(traceHandler{slog.NewJSONHandler(&output, nil)})
	logger.InfoContext(ctx, "hello")

	spanContext := span.SpanContext()
	for _, want := range []string{spanContext.TraceID().String(), spanContext.SpanID().String()} {
		if !strings.Contains(output.String(), want) {
			t.Fatalf("log %q does not contain %q", output.String(), want)
		}
	}
}
