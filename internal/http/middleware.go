package apphttp

import (
	"context"
	"log/slog"
	"net/http"
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
	status int
	bytes  int
}

func (w *responseLogger) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *responseLogger) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(data)
	w.bytes += n
	return n, err
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		recorder := &responseLogger{ResponseWriter: w}
		next.ServeHTTP(recorder, r)
		if recorder.status == 0 {
			recorder.status = http.StatusOK
		}
		duration := time.Since(start)
		route := r.Pattern
		if route == "" {
			route = "unmatched"
		}
		metrics.ObserveHTTPRequest(r.Method, route, recorder.status, duration)
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
			"duration_ms", duration.Milliseconds(),
		)
	})
}
