// Task 91586: the RPC gateway's cache, singleflight, sendTransaction
// invalidation, 429 absorption, pacing and pass-through behaviour.
package rpcgw

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// fakeUpstream is a devnet stand-in that counts every request; `?mode=http429`
// on its URL makes the first request answer HTTP 429.
func fakeUpstream(t *testing.T) (string, *atomic.Int32) {
	t.Helper()
	var calls atomic.Int32
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := calls.Add(1)
		body, _ := io.ReadAll(r.Body)
		if bytes.HasPrefix(bytes.TrimSpace(body), []byte("[")) { // batch: answer per element
			_, _ = w.Write([]byte(`[{"jsonrpc":"2.0","id":1,"result":"a"},{"jsonrpc":"2.0","id":2,"result":"b"}]`))
			return
		}
		var req struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
		}
		_ = json.Unmarshal(body, &req)
		answer := func(v any) {
			_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": req.ID, "result": v})
		}
		fail := func(code int, msg string) {
			_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": req.ID,
				"error": map[string]any{"code": code, "message": msg}})
		}
		if r.URL.Query().Get("mode") == "http429" && n == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte("Too many requests"))
			return
		}
		switch req.Method {
		case "rpc429": // first call answers a JSON-RPC error with code 429 (public devnet's wording)
			if n == 1 {
				fail(429, "Too many requests for a specific RPC call")
				return
			}
			answer(map[string]any{"retried": true})
		case "upstreamErr":
			fail(-32000, "node sad")
		case "getTransaction":
			answer(nil) // a tx the node has not indexed yet
		default:
			answer(map[string]any{"method": req.Method, "call": n})
		}
	}))
	t.Cleanup(up.Close)
	return up.URL, &calls
}

// startGateway fronts upstreamURL and serves it on a test address.
func startGateway(t *testing.T, upstreamURL string, o options) (*Gateway, string) {
	t.Helper()
	gw := newGateway(upstreamURL, slog.New(slog.DiscardHandler), o)
	srv := httptest.NewServer(gw)
	t.Cleanup(srv.Close)
	return gw, srv.URL
}

// fast keeps every default but the 429 cool-down (10 ms) so retries are quick.
func fast() options { return options{coolBase: 10 * time.Millisecond, statsEvery: time.Hour} }

// callRPC posts one JSON-RPC request and decodes the object answer.
func callRPC(t *testing.T, url string, id any, method string, params any) map[string]any {
	t.Helper()
	raw, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params})
	status, body := post(t, url, raw)
	return decodeObject(t, status, body)
}

func post(t *testing.T, url string, body []byte) (int, []byte) {
	t.Helper()
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read answer: %v", err)
	}
	return resp.StatusCode, raw
}

func decodeObject(t *testing.T, status int, raw []byte) map[string]any {
	t.Helper()
	out := map[string]any{}
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode answer (status %d): %v", status, err)
	}
	return out
}

// A cache hit answers with the CALLER's id and makes no upstream call.
func TestCacheHitAnswersWithCallerID(t *testing.T) {
	up, calls := fakeUpstream(t)
	_, url := startGateway(t, up, fast())
	params := []any{"AVMoJ7VrsMQ8tPjxWZYeDb9nXZuVhxzXb2S2QZKtcHq", map[string]any{"encoding": "base64"}}

	first := callRPC(t, url, 7, "getAccountInfo", params)
	second := callRPC(t, url, "caller-two", "getAccountInfo", params)

	if n := calls.Load(); n != 1 {
		t.Fatalf("upstream calls = %d, want 1 (second read served from cache)", n)
	}
	if second["id"] != "caller-two" {
		t.Errorf("cached answer id = %v, want the caller's (caller-two)", second["id"])
	}
	if fmt.Sprint(second["result"]) != fmt.Sprint(first["result"]) {
		t.Errorf("cached result = %v, want %v", second["result"], first["result"])
	}
}

// N concurrent identical requests share one upstream call and each answer with
// its own id.
func TestSingleflightSharesOneUpstreamCall(t *testing.T) {
	up, calls := fakeUpstream(t)
	gw, url := startGateway(t, up, fast())

	const n = 8
	answers := make(chan map[string]any, n)
	var wg sync.WaitGroup
	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			answers <- callRPC(t, url, fmt.Sprintf("c%d", i), "getSlot", nil)
		}()
	}
	wg.Wait()
	close(answers)

	if c := calls.Load(); c != 1 {
		t.Fatalf("upstream calls = %d, want 1 for %d identical concurrent requests", c, n)
	}
	if s := gw.shared.Load(); s != n-1 {
		t.Errorf("singleflight shares = %d, want %d", s, n-1)
	}
	seen := map[string]bool{}
	for res := range answers {
		id, _ := res["id"].(string)
		if !bytes.HasPrefix([]byte(id), []byte("c")) || seen[id] {
			t.Errorf("answer id = %v, want one unique c0…c%d per caller", res["id"], n-1)
		}
		seen[id] = true
		if res["result"] == nil {
			t.Errorf("answer %v has no result", res)
		}
	}
	if len(seen) != n {
		t.Errorf("distinct caller ids answered = %d, want %d", len(seen), n)
	}
}

// Every successful sendTransaction clears the account-state cache: the CLI's
// next read after its own write must not see pre-write state.
func TestSendTransactionClearsAccountCache(t *testing.T) {
	up, calls := fakeUpstream(t)
	_, url := startGateway(t, up, fast())
	params := []any{"AVMoJ7VrsMQ8tPjxWZYeDb9nXZuVhxzXb2S2QZKtcHq", map[string]any{"encoding": "base64"}}

	callRPC(t, url, 1, "getAccountInfo", params)
	send := callRPC(t, url, 2, "sendTransaction", []any{"base64wire", map[string]any{"skipPreflight": true}})
	if send["result"] == nil {
		t.Fatalf("sendTransaction failed: %v", send)
	}
	after := callRPC(t, url, 3, "getAccountInfo", params)

	if n := calls.Load(); n != 3 {
		t.Fatalf("upstream calls = %d, want 3 (account read + send + fresh read: the cache was cleared)", n)
	}
	if after["result"] == nil {
		t.Errorf("post-write getAccountInfo has no result: %v", after)
	}
}

// An upstream HTTP 429 is retried after the cool-down and the caller gets the
// result, never the 429.
func TestHTTP429RetriedAfterCooldown(t *testing.T) {
	up, calls := fakeUpstream(t)
	gw, url := startGateway(t, up+"?mode=http429", fast())

	res := callRPC(t, url, 1, "getSlot", nil)

	if res["result"] == nil {
		t.Fatalf("caller saw %v, want the retried result", res)
	}
	if n := calls.Load(); n != 2 {
		t.Fatalf("upstream calls = %d, want 2 (429 then success)", n)
	}
	if gw.rateLimited.Load() != 1 {
		t.Errorf("rate_limited stat = %d, want 1", gw.rateLimited.Load())
	}
}

// A JSON-RPC error with code 429 is absorbed the same way as an HTTP 429.
func TestJSONRPC429RetriedAfterCooldown(t *testing.T) {
	up, calls := fakeUpstream(t)
	_, url := startGateway(t, up, fast())

	res := callRPC(t, url, 1, "rpc429", nil)

	if res["error"] != nil || res["result"] == nil {
		t.Fatalf("caller saw %v, want the retried result", res)
	}
	if n := calls.Load(); n != 2 {
		t.Fatalf("upstream calls = %d, want 2 (rpc 429 then success)", n)
	}
}

// Pacing waits instead of failing: at 5 req/s burst 2, ten requests take at
// least ~1.5 s (8 of them queue for a token).
func TestPacingWaitsUnderBudget(t *testing.T) {
	up, calls := fakeUpstream(t)
	_, url := startGateway(t, up, options{
		totalRate: 5, totalBurst: 2, perMethodRate: 1000, perMethodBurst: 1000,
		coolBase: 10 * time.Millisecond, statsEvery: time.Hour,
	})

	start := time.Now()
	for i := range 10 { // getSignatureStatuses is never cached; distinct sigs defeat singleflight
		callRPC(t, url, i, "getSignatureStatuses", []any{[]string{fmt.Sprintf("sig%d", i)}})
	}
	if d := time.Since(start); d < 1500*time.Millisecond {
		t.Errorf("10 paced requests took %s, want ≥ 1.5 s", d)
	}
	if n := calls.Load(); n != 10 {
		t.Errorf("upstream calls = %d, want 10", n)
	}
}

// A null getTransaction means "not indexed yet" — it must not be cached.
func TestNullGetTransactionNotCached(t *testing.T) {
	up, calls := fakeUpstream(t)
	_, url := startGateway(t, up, fast())
	params := []any{"3aMjwVRksrEYb3DD8YgbGNciwZGxbTyYJBr2AoniXk5DmxBRRERzLTkXfgHVxaaHZdxbZ9hifift3L2a5z4ak33"}

	first := callRPC(t, url, 1, "getTransaction", params)
	second := callRPC(t, url, 2, "getTransaction", params)

	if first["result"] != nil || second["result"] != nil {
		t.Errorf("fake answers null; got %v / %v", first["result"], second["result"])
	}
	if n := calls.Load(); n != 2 {
		t.Fatalf("upstream calls = %d, want 2 (null results are not cached)", n)
	}
}

// Unknown methods pass through to the upstream; other JSON-RPC errors come
// back unchanged instead of being retried or swallowed.
func TestUnknownMethodAndErrorsPassThrough(t *testing.T) {
	up, calls := fakeUpstream(t)
	_, url := startGateway(t, up, fast())

	res := callRPC(t, url, 1, "getFoo", []any{"x"})
	if result, _ := res["result"].(map[string]any); result["method"] != "getFoo" {
		t.Errorf("unknown method answer = %v, want the upstream result", res)
	}

	errRes := callRPC(t, url, 2, "upstreamErr", nil)
	rpcErr, _ := errRes["error"].(map[string]any)
	if code, _ := rpcErr["code"].(float64); code != -32000 {
		t.Errorf("upstream error = %v, want code -32000 unchanged", errRes)
	}
	if n := calls.Load(); n != 2 {
		t.Errorf("upstream calls = %d, want 2", n)
	}
}

// A JSON-RPC batch is forwarded uncached: two identical batches cost two
// upstream calls, and the array answer reaches the caller intact.
func TestBatchPassedThroughUncached(t *testing.T) {
	up, calls := fakeUpstream(t)
	_, url := startGateway(t, up, fast())
	batch := []byte(`[{"jsonrpc":"2.0","id":1,"method":"getSlot"},{"jsonrpc":"2.0","id":2,"method":"getEpochInfo"}]`)

	for range 2 {
		status, raw := post(t, url, batch)
		if status != http.StatusOK || !bytes.HasPrefix(bytes.TrimSpace(raw), []byte("[")) {
			t.Fatalf("batch answer = %d %s, want the upstream array", status, raw)
		}
		if !bytes.Contains(raw, []byte(`"a"`)) {
			t.Errorf("batch answer %s does not carry the upstream results", raw)
		}
	}
	if n := calls.Load(); n != 2 {
		t.Fatalf("upstream calls = %d, want 2 (batches are not cached)", n)
	}
}

// The upstream URL (and its api-key query) never reaches a caller, even in a
// transport error.
func TestUpstreamURLRedactedInErrors(t *testing.T) {
	_, url := startGateway(t, "http://127.0.0.1:1/rpc?api-key=SECRET", fast())

	res := callRPC(t, url, 1, "getSlot", nil)
	rpcErr, _ := res["error"].(map[string]any)
	msg, _ := rpcErr["message"].(string)
	if bytes.Contains([]byte(msg), []byte("SECRET")) || bytes.Contains([]byte(msg), []byte("api-key")) {
		t.Errorf("transport error leaks the upstream URL: %q", msg)
	}
}

// TestBurstShrinksUpstreamCalls is the worklog measurement: a burst like a busy
// minute (10 dashboard-style refreshes: 3 account reads, a slot and blockhash
// poll, one signature status each) collapses to a fraction of its requests.
func TestBurstShrinksUpstreamCalls(t *testing.T) {
	up, calls := fakeUpstream(t)
	_, url := startGateway(t, up, fast())

	const rounds = 10
	accounts := []string{"AVMoJ7VrsMQ8tPjxWZYeDb9nXZuVhxzXb2S2QZKtcHq", "4EjuQ55ftJD99eMGphR1cXV3TnVKQEpzgHVsWnqSsiGj9RDgkkXaSEJ6oYSJupLcv6cEdBpJPcseVtvPzGQ6U3q", "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd"}
	start := time.Now()
	requests := 0
	for range rounds {
		for _, a := range accounts {
			callRPC(t, url, requests, "getAccountInfo", []any{a, map[string]any{"encoding": "base64"}})
			requests++
		}
		callRPC(t, url, requests, "getSlot", nil)
		requests++
		callRPC(t, url, requests, "getLatestBlockhash", nil)
		requests++
		callRPC(t, url, requests, "getSignatureStatuses", []any{[]string{"sigX"}})
		requests++
	}
	upstream := int(calls.Load())
	t.Logf("%d requests -> %d upstream calls (%.0f%% reduction) in %s",
		requests, upstream, 100*(1-float64(upstream)/float64(requests)), time.Since(start))
	if upstream >= requests/2 {
		t.Errorf("upstream calls = %d for %d requests: cache/dedupe not collapsing the burst", upstream, requests)
	}
}
