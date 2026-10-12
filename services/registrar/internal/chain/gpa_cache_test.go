// Task 91583: the getProgramAccount scan cache (TTL + singleflight +
// executor-step invalidation) and the HTTP-429 exponential backoff.
package chain

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"
	"github.com/solana-foundation/solana-go/v2/rpc"
)

// gpaServer counts getProgramAccounts requests; a Series scan answers with one
// row, every other discriminator with an empty result.
func gpaServer(t *testing.T) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	seriesDisc, err := AccountDiscriminator("Series")
	if err != nil {
		t.Fatal(err)
	}
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		var req struct {
			Params []json.RawMessage `json:"params"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("decode request: %v", err)
		}
		var opts struct {
			Filters []rpc.RPCFilter `json:"filters"`
		}
		_ = json.Unmarshal(req.Params[1], &opts)
		rows := []map[string]any{}
		if m := opts.Filters[0].Memcmp; m != nil && string(m.Bytes) == string(seriesDisc[:]) {
			rows = append(rows, seriesRow(t, seriesPDA(t)))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": rows})
	}))
	t.Cleanup(srv.Close)
	return srv, &calls
}

func seriesRow(t *testing.T, pda solana.PublicKey) map[string]any {
	t.Helper()
	disc, err := AccountDiscriminator("Series")
	if err != nil {
		t.Fatal(err)
	}
	return accountJSON(t, pda, append(append([]byte{}, disc[:]...), encodeSeries(&Series{Mint: pk(t, testProgram)})...))
}

func seriesPDA(t *testing.T) solana.PublicKey {
	t.Helper()
	return pk(t, "AVMoJ7VrsMQ8tPjxWZYeDb9nXZuVhxzXb2S2QZKtcHq")
}

// gpaCallsPerRefresh runs one scheduler tick (AllSeries + investors +
// entitlements) plus the reads a dashboard refresh does — the sequence whose
// RPC call count the cache must shrink (numbers for the worklog).
func gpaCallsPerRefresh(t *testing.T, cl *Client) {
	t.Helper()
	series := seriesPDA(t)
	for range 2 {
		if _, err := cl.AllSeries(t.Context()); err != nil {
			t.Fatalf("AllSeries: %v", err)
		}
		if _, err := cl.FetchInvestorsBySeries(t.Context(), series); err != nil {
			t.Fatalf("FetchInvestorsBySeries: %v", err)
		}
		if _, err := cl.FetchActionsBySeries(t.Context(), series); err != nil {
			t.Fatalf("FetchActionsBySeries: %v", err)
		}
		if _, err := cl.FetchEntitlementsByAction(t.Context(), series); err != nil {
			t.Fatalf("FetchEntitlementsByAction: %v", err)
		}
	}
}

// Two reads of the same scan inside the TTL share one RPC request, and callers
// cannot corrupt the cache through the returned slice.
func TestGPACacheHitWithinTTL(t *testing.T) {
	srv, calls := gpaServer(t)
	cl := testClient(t, srv.URL)

	a, err := cl.AllSeries(t.Context())
	if err != nil || len(a) != 1 {
		t.Fatalf("first AllSeries = (%d, %v), want 1 series", len(a), err)
	}
	b, err := cl.AllSeries(t.Context())
	if err != nil || len(b) != 1 {
		t.Fatalf("second AllSeries = (%d, %v), want 1 series", len(b), err)
	}
	if n := calls.Load(); n != 1 {
		t.Errorf("rpc calls = %d, want 1 (second read served from cache)", n)
	}
	// Mutating a returned copy must not poison the cache.
	b[0].Series.TotalIssued = 999
	c, err := cl.AllSeries(t.Context())
	if err != nil || c[0].Series.TotalIssued != a[0].Series.TotalIssued {
		t.Errorf("cached series mutated through the returned copy: %+v", c[0].Series)
	}
	if n := calls.Load(); n != 1 {
		t.Errorf("rpc calls = %d after mutation, want 1", n)
	}
}

// After the TTL the scan goes back to the RPC node.
func TestGPACacheExpiresAfterTTL(t *testing.T) {
	srv, calls := gpaServer(t)
	cl := testClient(t, srv.URL)
	now := time.Unix(1_700_000_000, 0)
	cl.cache.now = func() time.Time { return now }

	if _, err := cl.AllSeries(t.Context()); err != nil {
		t.Fatalf("AllSeries: %v", err)
	}
	now = now.Add(cl.cache.ttl + time.Second)
	if _, err := cl.AllSeries(t.Context()); err != nil {
		t.Fatalf("AllSeries after ttl: %v", err)
	}
	if n := calls.Load(); n != 2 {
		t.Errorf("rpc calls = %d, want 2 (cache expired)", n)
	}
}

// InvalidateProgramAccounts (the executor-step hook) forces a fresh scan.
func TestGPACacheInvalidation(t *testing.T) {
	srv, calls := gpaServer(t)
	cl := testClient(t, srv.URL)

	if _, err := cl.AllSeries(t.Context()); err != nil {
		t.Fatalf("AllSeries: %v", err)
	}
	cl.InvalidateProgramAccounts()
	if _, err := cl.AllSeries(t.Context()); err != nil {
		t.Fatalf("AllSeries after invalidate: %v", err)
	}
	if n := calls.Load(); n != 2 {
		t.Errorf("rpc calls = %d, want 2 (cache invalidated)", n)
	}
}

// N concurrent identical scans collapse into one RPC request (singleflight).
func TestGPASingleflight(t *testing.T) {
	release := make(chan struct{})
	var first sync.Once
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		first.Do(func() { <-release }) // hold the first scan until every caller piles on
		calls.Add(1)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"result": []map[string]any{seriesRow(t, seriesPDA(t))},
		})
	}))
	defer srv.Close()
	cl := testClient(t, srv.URL)

	const n = 8
	var wg sync.WaitGroup
	var failed atomic.Int32
	start := make(chan struct{})
	for range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if _, err := cl.AllSeries(t.Context()); err != nil {
				failed.Add(1)
			}
		}()
	}
	close(start)
	time.Sleep(50 * time.Millisecond) // let all goroutines reach the in-flight scan
	close(release)
	wg.Wait()

	if failed.Load() != 0 {
		t.Fatalf("%d of %d concurrent reads failed", failed.Load(), n)
	}
	if n := calls.Load(); n != 1 {
		t.Errorf("rpc calls = %d, want 1 (singleflight collapsed %d concurrent reads)", n, 8)
	}
}

// One refresh cycle (a scheduler tick + dashboard reads) needs one RPC request
// per distinct scan instead of one per call — the numbers for the worklog.
func TestGPACacheCallReduction(t *testing.T) {
	run := func(ttl time.Duration) int32 {
		srv, calls := gpaServer(t)
		cl := NewClient(srv.URL, pk(t, testProgram), slog.New(slog.DiscardHandler))
		cl.cache.ttl = ttl
		gpaCallsPerRefresh(t, cl)
		return calls.Load()
	}
	uncached, cached := run(0), run(3*time.Second)
	t.Logf("gPA requests per refresh cycle: uncached=%d cached=%d", uncached, cached)
	if cached >= uncached {
		t.Errorf("cache did not reduce rpc calls: uncached=%d cached=%d", uncached, cached)
	}
}

// HTTP 429 backs off exponentially and retries until the node lets us through.
func TestGetProgramAccountsBacksOffOn429(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) <= 2 {
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte("too many requests for this api key")) // not JSON → HTTPError{429}
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": []any{}})
	}))
	defer srv.Close()
	cl := testClient(t, srv.URL)
	cl.rateLimitBase = 2 * time.Millisecond // keep the test fast; the schedule itself is unit-tested below

	disc, err := AccountDiscriminator("Series")
	if err != nil {
		t.Fatal(err)
	}
	recs, err := cl.GetProgramAccounts(t.Context(), disc, nil)
	if err != nil || len(recs) != 0 {
		t.Fatalf("GetProgramAccounts after 429s = (%d, %v), want success", len(recs), err)
	}
	if n := calls.Load(); n != 3 {
		t.Errorf("rpc calls = %d, want 3 (two 429s then success)", n)
	}
}

// The 429 schedule is 0.5 s, 1 s, 2 s … with ±25% jitter.
func TestRateLimitBackoffSchedule(t *testing.T) {
	base := 500 * time.Millisecond
	for attempt, want := range []time.Duration{500 * time.Millisecond, time.Second, 2 * time.Second, 4 * time.Second} {
		for range 50 {
			got := rateLimitBackoff(base, attempt+1)
			lo, hi := want*75/100, want*125/100
			if got < lo || got > hi {
				t.Fatalf("attempt %d backoff = %s, want [%s, %s]", attempt+1, got, lo, hi)
			}
		}
	}
}
