package auth

import (
	"sync"
	"time"
)

// Limiter is a per-key sliding window. Keys are emails (spoof-proof) or client IPs taken from the last
// X-Forwarded-For hop, which Caddy sets.
type Limiter struct {
	mu     sync.Mutex
	max    int
	window time.Duration
	hits   map[string][]time.Time
}

// sweepAbove: past this many keys, every call drops keys with no hit inside the window (a key spray cannot grow
// the map without bound). ponytail: O(n) sweep, fine at this size; a ring of buckets if it ever is not.
const sweepAbove = 4096

func NewLimiter(max int, window time.Duration) *Limiter {
	return &Limiter{max: max, window: window, hits: map[string][]time.Time{}}
}

func (l *Limiter) recent(key string, now time.Time) []time.Time {
	kept := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if now.Sub(t) < l.window {
			kept = append(kept, t)
		}
	}
	if len(kept) == 0 {
		delete(l.hits, key)
		return nil
	}
	l.hits[key] = kept
	return kept
}

func (l *Limiter) sweep(now time.Time) {
	if len(l.hits) <= sweepAbove {
		return
	}
	for k := range l.hits {
		l.recent(k, now)
	}
}

// Allow records a hit and reports whether the key was under its limit.
func (l *Limiter) Allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.sweep(now)
	if len(l.recent(key, now)) >= l.max {
		return false
	}
	l.hits[key] = append(l.hits[key], now)
	return true
}

// Blocked reports whether the key is at its limit, without recording a hit.
func (l *Limiter) Blocked(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.recent(key, now)) >= l.max
}

// Hit records one event (e.g. a failed password) for the key.
func (l *Limiter) Hit(key string, now time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.sweep(now)
	l.hits[key] = append(l.recent(key, now), now)
}
