package handlers

import (
	"strings"
	"sync"
	"time"
)

const (
	loginFailureLimit  = 10
	loginFailureWindow = 15 * time.Minute
	// Bounds memory when many distinct emails fail.
	loginThrottleSweepAt = 10_000
)

type loginFailures struct {
	count int
	since time.Time
}

// LoginThrottle limits password guesses per account, not per IP, so it holds
// behind any proxy. A locked account can still sign in with a passkey.
type LoginThrottle struct {
	mu       sync.Mutex
	now      func() time.Time
	failures map[string]loginFailures
}

func NewLoginThrottle(now func() time.Time) *LoginThrottle {
	return &LoginThrottle{now: now, failures: map[string]loginFailures{}}
}

func loginKey(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

// retryAfter reports how long the account stays locked, or zero.
func (t *LoginThrottle) retryAfter(email string) time.Duration {
	t.mu.Lock()
	defer t.mu.Unlock()
	entry, ok := t.failures[loginKey(email)]
	if !ok || entry.count < loginFailureLimit {
		return 0
	}
	remaining := entry.since.Add(loginFailureWindow).Sub(t.now())
	if remaining <= 0 {
		delete(t.failures, loginKey(email))
		return 0
	}
	return remaining
}

func (t *LoginThrottle) recordFailure(email string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	now := t.now()
	if len(t.failures) >= loginThrottleSweepAt {
		for key, entry := range t.failures {
			if !now.Before(entry.since.Add(loginFailureWindow)) {
				delete(t.failures, key)
			}
		}
	}
	key := loginKey(email)
	entry := t.failures[key]
	if entry.count == 0 || !now.Before(entry.since.Add(loginFailureWindow)) {
		entry = loginFailures{since: now}
	}
	entry.count++
	t.failures[key] = entry
}

func (t *LoginThrottle) recordSuccess(email string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.failures, loginKey(email))
}
