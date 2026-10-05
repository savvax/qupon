package api

// Short-lived read cache for the public chain read models. Every page of the web app lists series and their
// investors/actions; each of those reads the chain over RPC (GET /series ≈ 3 s on devnet), so a few seconds of
// caching turns a 23-request page into one chain round per key. Any successful write clears the whole cache, so a
// step's new status shows up on the next poll.

import (
	"bytes"
	"net/http"
	"strings"
	"sync"
	"time"
)

type cachedResponse struct {
	body        []byte
	contentType string
	expires     time.Time
}

// ponytail: one global map + mutex, cleared wholesale on writes; per-key invalidation if the write rate ever matters.
type readCache struct {
	ttl     time.Duration
	now     func() time.Time
	mu      sync.Mutex
	entries map[string]cachedResponse
}

// cacheable: chain read models only — not sessions, the audit/approvals feeds, reconcile (an explicit fresh check)
// or the DB-backed activity feed.
func cacheable(path string) bool {
	return (strings.HasPrefix(path, "/series") || strings.HasPrefix(path, "/actions/")) &&
		!strings.HasSuffix(path, "/reconcile")
}

type recorder struct {
	http.ResponseWriter
	status int
	buf    bytes.Buffer
}

func (r *recorder) WriteHeader(code int) { r.status = code; r.ResponseWriter.WriteHeader(code) }
func (r *recorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	r.buf.Write(b)
	return r.ResponseWriter.Write(b)
}

func (c *readCache) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			rec := &recorder{ResponseWriter: w}
			next.ServeHTTP(rec, r)
			if r.Method != http.MethodOptions && rec.status != 0 && rec.status < 400 {
				c.mu.Lock()
				c.entries = map[string]cachedResponse{}
				c.mu.Unlock()
			}
			return
		}
		if !cacheable(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		key := r.URL.RequestURI()
		c.mu.Lock()
		hit, ok := c.entries[key]
		c.mu.Unlock()
		if ok && c.now().Before(hit.expires) {
			w.Header().Set("Content-Type", hit.contentType)
			w.Header().Set("X-Cache", "hit")
			_, _ = w.Write(hit.body)
			return
		}
		rec := &recorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		if rec.status == http.StatusOK {
			c.mu.Lock()
			c.entries[key] = cachedResponse{body: rec.buf.Bytes(), contentType: w.Header().Get("Content-Type"), expires: c.now().Add(c.ttl)}
			c.mu.Unlock()
		}
	})
}

// newReadCache returns the middleware; ttl ≤ 0 disables caching.
func newReadCache(ttl time.Duration, now func() time.Time) func(http.Handler) http.Handler {
	if ttl <= 0 {
		return func(next http.Handler) http.Handler { return next }
	}
	c := &readCache{ttl: ttl, now: now, entries: map[string]cachedResponse{}}
	return c.middleware
}
