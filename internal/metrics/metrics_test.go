package metrics

import (
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

func TestObserveHTTPRequestRegistersCounter(t *testing.T) {
	ObserveHTTPRequest("GET", "/test", 200, time.Millisecond)

	families, err := prometheus.DefaultGatherer.Gather()
	if err != nil {
		t.Fatal(err)
	}
	for _, family := range families {
		if family.GetName() == "orpheus_http_requests_total" {
			return
		}
	}
	t.Fatal("missing orpheus_http_requests_total")
}
