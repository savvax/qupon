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

// maxEntries caps the cache; a full cache drops expired entries and otherwise stops caching new keys.
const maxEntries = 1000

// cacheable: chain read models only — not sessions, the audit/approvals feeds, reconcile (an explicit fresh check)
// or the DB-backed activity feed. Any query other than ?lang= bypasses the cache, so random query strings cannot
// grow it or force chain reads through it.
func cacheable(r *http.Request) bool {
	path := r.URL.Path
	readModel := strings.HasPrefix(path, "/series") || strings.HasPrefix(path, "/actions/") || strings.HasPrefix(path, "/holders/")
	if !readModel || strings.HasSuffix(path, "/reconcile") {
		return false
	}
	for k := range r.URL.Query() {
		if k != "lang" && k != "featured" { // ?featured=1 on /series (task 1525); anything else bypasses
			return false
		}
	}
	return true
}

// invalidates: writes that can change chain state; sign-in/out (anonymous, cheap) must not flush the cache.
func invalidates(r *http.Request) bool {
	return r.Method != http.MethodOptions && !strings.HasPrefix(r.URL.Path, "/auth/")
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

// ttlFor is the cache lifetime of a path: the public holder lookup holds 15 s (task 1525),
// everything else the configured read TTL.
func (c *readCache) ttlFor(path string) time.Duration {
	if strings.HasPrefix(path, "/holders/") {
		return 15 * time.Second
	}
	return c.ttl
}

func (c *readCache) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			rec := &recorder{ResponseWriter: w}
			next.ServeHTTP(rec, r)
			if invalidates(r) && rec.status != 0 && rec.status < 400 {
				c.mu.Lock()
				c.entries = map[string]cachedResponse{}
				c.mu.Unlock()
			}
			return
		}
		if !cacheable(r) {
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
			if len(c.entries) >= maxEntries {
				for k, e := range c.entries {
					if !c.now().Before(e.expires) {
						delete(c.entries, k)
					}
				}
			}
			if len(c.entries) < maxEntries {
				c.entries[key] = cachedResponse{body: rec.buf.Bytes(), contentType: w.Header().Get("Content-Type"), expires: c.now().Add(c.ttlFor(r.URL.Path))}
			}
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
