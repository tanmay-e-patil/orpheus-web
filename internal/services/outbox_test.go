package services

import (
	"testing"
	"time"
)

func TestPublicationRetryDelayIsBounded(t *testing.T) {
	for _, attempt := range []int{-1, 0, 1, 2, 10, 100} {
		for range 20 {
			delay := publicationRetryDelay(attempt)
			if delay < time.Second || delay > 5*time.Minute {
				t.Fatalf("attempt %d delay %s", attempt, delay)
			}
		}
	}
}
