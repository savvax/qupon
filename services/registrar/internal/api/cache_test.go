package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestReadCache(t *testing.T) {
	now := time.Unix(1_000, 0)
	calls := map[string]int{}
	status := http.StatusOK
	h := newReadCache(10*time.Second, func() time.Time { return now })(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls[r.Method+" "+r.URL.Path]++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(`{"n":1}`))
	}))
	do := func(method, path string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
		return rec
	}

	do("GET", "/series")
	if rec := do("GET", "/series"); rec.Header().Get("X-Cache") != "hit" || rec.Body.String() != `{"n":1}` || rec.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("second GET not served from cache: %v %q", rec.Header(), rec.Body.String())
	}
	if calls["GET /series"] != 1 {
		t.Fatalf("handler ran %d times, want 1", calls["GET /series"])
	}

	// a successful write clears the cache; a failed one does not
	do("GET", "/actions/X")
	status = http.StatusConflict
	do("POST", "/registrar/actions/X/advance")
	status = http.StatusOK
	do("GET", "/actions/X")
	if calls["GET /actions/X"] != 1 {
		t.Fatalf("failed write cleared the cache")
	}
	do("POST", "/registrar/actions/X/advance")
	do("GET", "/actions/X")
	if calls["GET /actions/X"] != 2 {
		t.Fatalf("successful write did not clear the cache")
	}

	// never cached: sessions, reconcile, non-200
	do("GET", "/me")
	do("GET", "/me")
	do("GET", "/actions/X/reconcile")
	do("GET", "/actions/X/reconcile")
	if calls["GET /me"] != 2 || calls["GET /actions/X/reconcile"] != 2 {
		t.Fatalf("uncacheable paths were cached: %v", calls)
	}
	status = http.StatusNotFound
	do("GET", "/series/missing")
	do("GET", "/series/missing")
	if calls["GET /series/missing"] != 2 {
		t.Fatalf("a 404 was cached")
	}

	// arbitrary query strings bypass the cache; ?lang= is cached
	status = http.StatusOK
	do("GET", "/series?x=1")
	do("GET", "/series?x=1")
	if calls["GET /series"] != 3 {
		t.Fatalf("a random query was cached: %d", calls["GET /series"])
	}
	do("GET", "/actions/X/notice?lang=ru")
	do("GET", "/actions/X/notice?lang=ru")
	if calls["GET /actions/X/notice"] != 1 {
		t.Fatalf("?lang= was not cached")
	}
	// sign-in/out do not flush
	do("POST", "/auth/demo")
	do("GET", "/actions/X/notice?lang=ru")
	if calls["GET /actions/X/notice"] != 1 {
		t.Fatalf("/auth POST flushed the cache")
	}

	// expiry
	status = http.StatusOK
	now = now.Add(11 * time.Second)
	do("GET", "/series")
	if calls["GET /series"] != 4 {
		t.Fatalf("entry served after its TTL")
	}
}
