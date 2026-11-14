package apphttp

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"orpheus-web/internal/http/handlers"
	"orpheus-web/internal/metrics"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, err := s.Auth.SessionFromRequest(r)
		if err != nil {
			handlers.Error(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
			return
		}
		ctx := context.WithValue(r.Context(), userIDCtxKey, claims.UserID)
		ctx = context.WithValue(ctx, usernameCtxKey, claims.Username)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

const (
	publicAuthBodyLimit = 64 << 10
	// Discovery commits carry every lyrics candidate for every track.
	apiBodyLimit = 32 << 20
)

func limitBodies(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		limit := int64(apiBodyLimit)
		if strings.HasPrefix(r.URL.Path, "/api/auth/") {
			limit = publicAuthBodyLimit
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		next.ServeHTTP(w, r)
	})
}

func method(method string, next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != method {
			w.Header().Set("Allow", method)
			handlers.Error(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed")
			return
		}
		next(w, r)
	})
}

type responseLogger struct {
	http.ResponseWriter
	start       time.Time
	status      int
	bytes       int
	firstByteAt time.Duration
}

func (w *responseLogger) markFirstByte() {
	if w.firstByteAt == 0 {
		w.firstByteAt = time.Since(w.start)
	}
}

func (w *responseLogger) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
		w.markFirstByte()
	}
	w.ResponseWriter.WriteHeader(status)
}

// Unwrap lets http.ResponseController reach the underlying writer.
func (w *responseLogger) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *responseLogger) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
		w.markFirstByte()
	}
	n, err := w.ResponseWriter.Write(data)
	w.bytes += n
	return n, err
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		recorder := &responseLogger{ResponseWriter: w, start: start}
		next.ServeHTTP(recorder, r)
		duration := time.Since(start)
		if recorder.status == 0 {
			recorder.status = http.StatusOK
			recorder.firstByteAt = duration
		}
		route := r.Pattern
		if route == "" {
			route = "unmatched"
		}
		metrics.ObserveHTTPRequest(r.Method, route, recorder.status, duration, recorder.firstByteAt)
		span := trace.SpanFromContext(r.Context())
		if span.IsRecording() {
			span.SetName(r.Method + " " + route)
			span.SetAttributes(attribute.String("http.route", route))
		}
		slog.InfoContext(r.Context(), "HTTP request",
			"component", "http",
			"method", r.Method,
			"route", route,
			"path", r.URL.Path,
			"status", recorder.status,
			"response_bytes", recorder.bytes,
			"duration_ms", float64(duration.Microseconds())/1000,
			"ttfb_ms", float64(recorder.firstByteAt.Microseconds())/1000,
		)
	})
}
