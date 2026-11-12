package metrics

import (
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

// Fine-grained sub-5ms buckets so a p99 < 5ms objective is observable.
var latencyBuckets = []float64{0.0005, 0.001, 0.002, 0.003, 0.004, 0.005, 0.0075, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10}

var (
	DeletionPending       = prometheus.NewGauge(prometheus.GaugeOpts{Name: "orpheus_deletion_pending", Help: "Unfinished deletion jobs, including published jobs awaiting cleanup or DLQ repair."})
	DeletionOldestCreated = prometheus.NewGauge(prometheus.GaugeOpts{Name: "orpheus_deletion_oldest_created_timestamp_seconds", Help: "Creation timestamp of oldest unfinished deletion job; zero when empty."})
	OutboxPending         = prometheus.NewGauge(prometheus.GaugeOpts{Name: "orpheus_outbox_pending", Help: "Unpublished, unfinished song jobs at the last dispatcher wake-up."})
	OutboxOldestCreated   = prometheus.NewGauge(prometheus.GaugeOpts{Name: "orpheus_outbox_oldest_created_timestamp_seconds", Help: "Creation timestamp of oldest unpublished song job; zero when empty."})

	HTTPRequestDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "orpheus_http_request_duration_seconds",
		Help:    "HTTP request duration in seconds.",
		Buckets: latencyBuckets,
	}, []string{"method", "route", "status"})

	// Streaming routes (audio) spend most of their duration transferring the body,
	// so latency SLOs use time to first byte instead of total duration.
	HTTPTimeToFirstByte = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "orpheus_http_time_to_first_byte_seconds",
		Help:    "Time from request start until response headers are written.",
		Buckets: latencyBuckets,
	}, []string{"method", "route", "status"})

	HTTPRequestsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "orpheus_http_requests_total",
		Help: "HTTP requests served.",
	}, []string{"method", "route", "status"})

	QueuePublishTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "orpheus_queue_publish_total",
		Help: "RabbitMQ publish attempts.",
	}, []string{"queue", "result"})
)

func init() {
	prometheus.MustRegister(HTTPRequestDuration, HTTPTimeToFirstByte, HTTPRequestsTotal, QueuePublishTotal, OutboxPending, OutboxOldestCreated, DeletionPending, DeletionOldestCreated)
}

func ObserveHTTPRequest(method, route string, status int, duration, timeToFirstByte time.Duration) {
	if route == "" {
		route = "unknown"
	}
	statusText := strconv.Itoa(status)
	HTTPRequestsTotal.WithLabelValues(method, route, statusText).Inc()
	HTTPRequestDuration.WithLabelValues(method, route, statusText).Observe(duration.Seconds())
	HTTPTimeToFirstByte.WithLabelValues(method, route, statusText).Observe(timeToFirstByte.Seconds())
}

func ObserveQueuePublish(queue, result string) {
	QueuePublishTotal.WithLabelValues(queue, result).Inc()
}
