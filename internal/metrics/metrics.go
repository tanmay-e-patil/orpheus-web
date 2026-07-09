package metrics

import (
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

var (
	HTTPRequestDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "orpheus_http_request_duration_seconds",
		Help:    "HTTP request duration in seconds.",
		Buckets: []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
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
	prometheus.MustRegister(HTTPRequestDuration, HTTPRequestsTotal, QueuePublishTotal)
}

func ObserveHTTPRequest(method, route string, status int, duration time.Duration) {
	if route == "" {
		route = "unknown"
	}
	statusText := strconv.Itoa(status)
	HTTPRequestsTotal.WithLabelValues(method, route, statusText).Inc()
	HTTPRequestDuration.WithLabelValues(method, route, statusText).Observe(duration.Seconds())
}

func ObserveQueuePublish(queue, result string) {
	QueuePublishTotal.WithLabelValues(queue, result).Inc()
}
