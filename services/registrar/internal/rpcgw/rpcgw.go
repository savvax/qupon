// Package rpcgw is an in-process JSON-RPC gateway in front of the devnet RPC
// endpoint (task 91586). The chain client, the ingest poller and every `qupon`
// CLI subprocess talk to it on 127.0.0.1; only the gateway talks to the
// upstream — over a few kept-alive connections, paced under the public devnet
// per-IP limits (100 req/10 s total, 40 req/10 s per method), with a short
// result cache, in-flight dedupe and its own 429 absorption, so callers only
// ever see latency. See docs/02-architecture.md §Go registrar service.
package rpcgw

import (
	"bytes"
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/time/rate"
)

// Pacing defaults sit under the public devnet per-IP limits; the 429 cool-down
// doubles from 1 s to 8 s. Tests shrink all of them through `options`.
const (
	defTotalRate      = 8 // req/s across every method (limit: 100 / 10 s)
	defTotalBurst     = 16
	defPerMethodRate  = 3.5 // req/s for one method (limit: 40 / 10 s)
	defPerMethodBurst = 8
	defCoolBase       = time.Second
	defCoolMax        = 8 * time.Second
	maxTries          = 5 // upstream attempts per caller request when 429s keep coming
	txCacheBound      = 2000
	defStatsEvery     = 60 * time.Second
)

// Cache TTLs by method group. Account-state entries are also cleared by every
// successful sendTransaction — the CLI's next read after its own write must
// not see pre-write state.
const (
	ttlAccountState = 1500 * time.Millisecond
	ttlChainState   = 1 * time.Second
	ttlTx           = 10 * time.Minute
	ttlStatic       = 10 * time.Minute
)

var ttlByMethod = map[string]time.Duration{
	"getAccountInfo":                    ttlAccountState,
	"getMultipleAccounts":               ttlAccountState,
	"getProgramAccounts":                ttlAccountState,
	"getBalance":                        ttlAccountState,
	"getTokenAccountBalance":            ttlAccountState,
	"getTokenAccountsByOwner":           ttlAccountState,
	"getTokenLargestAccounts":           ttlAccountState,
	"getSignaturesForAddress":           ttlAccountState,
	"getLatestBlockhash":                ttlChainState,
	"getSlot":                           ttlChainState,
	"getBlockHeight":                    ttlChainState,
	"getEpochInfo":                      ttlChainState,
	"getTransaction":                    ttlTx, // non-null results only (isNull check in maybeStore)
	"getMinimumBalanceForRentExemption": ttlStatic,
	"getGenesisHash":                    ttlStatic,
	"getVersion":                        ttlStatic,
}

// Gateway is the local JSON-RPC proxy. Safe for concurrent use.
type Gateway struct {
	upstream string // full URL, query included — never logged, never returned in errors
	log      *slog.Logger
	hc       *http.Client

	total    *rate.Limiter // every upstream request, every method
	perRate  rate.Limit
	perBurst int
	perMu    sync.Mutex
	per      map[string]*rate.Limiter // one limiter per method

	mu      sync.Mutex
	entries map[string]entry // key = method + canonical params
	flights map[string]*flight
	txKeys  []string // FIFO bound for the getTransaction entries

	coolMu    sync.Mutex
	coolUntil time.Time // no upstream request starts before this (429 gate)
	coolLevel int       // doubling exponent, reset by any success

	coolBase   time.Duration
	coolMax    time.Duration
	statsEvery time.Duration

	upstreamCalls atomic.Int64
	cacheHits     atomic.Int64
	shared        atomic.Int64 // singleflight shares
	rateLimited   atomic.Int64
	maxQueueWait  atomic.Int64 // ns spent waiting for a pacing token
	methods       sync.Map     // method name -> *atomic.Int64 (upstream calls)

	now func() time.Time
}

type entry struct {
	result json.RawMessage
	at     time.Time
	ttl    time.Duration
}

// flight is one in-progress upstream round-trip; identical concurrent requests
// wait on done and share its answer.
type flight struct {
	done   chan struct{}
	status int
	body   []byte // raw upstream body (forwarded when it is not JSON-RPC)
	parsed *rpcResp
	err    error
}

type rpcReq struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type rpcResp struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcErr         `json:"error,omitempty"`
}

type rpcErr struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

// New builds a gateway proxying to upstream (query string allowed: it may carry
// an api-key, which is never logged and never reaches a caller).
func New(upstream string, log *slog.Logger) *Gateway {
	return newGateway(upstream, log, options{})
}

// options exists for tests (shrink the rates and the cool-down); zero fields
// fall back to the defaults above.
type options struct {
	totalRate      rate.Limit
	totalBurst     int
	perMethodRate  rate.Limit
	perMethodBurst int
	coolBase       time.Duration
	coolMax        time.Duration
	statsEvery     time.Duration
}

func newGateway(upstream string, log *slog.Logger, o options) *Gateway {
	if log == nil {
		log = slog.Default()
	}
	if o.totalRate <= 0 {
		o.totalRate = defTotalRate
	}
	if o.totalBurst <= 0 {
		o.totalBurst = defTotalBurst
	}
	if o.perMethodRate <= 0 {
		o.perMethodRate = defPerMethodRate
	}
	if o.perMethodBurst <= 0 {
		o.perMethodBurst = defPerMethodBurst
	}
	if o.coolBase <= 0 {
		o.coolBase = defCoolBase
	}
	if o.coolMax <= 0 {
		o.coolMax = defCoolMax
	}
	if o.statsEvery <= 0 {
		o.statsEvery = defStatsEvery
	}
	// A few kept-alive connections: public devnet also caps concurrent and new
	// connections per IP (40 each), which one burst of CLI processes blew past.
	trap := http.DefaultTransport.(*http.Transport).Clone()
	trap.MaxConnsPerHost = 4
	trap.MaxIdleConnsPerHost = 4
	return &Gateway{
		upstream:   upstream,
		log:        log,
		hc:         &http.Client{Transport: trap, Timeout: 90 * time.Second},
		total:      rate.NewLimiter(o.totalRate, o.totalBurst),
		perRate:    o.perMethodRate,
		perBurst:   o.perMethodBurst,
		per:        map[string]*rate.Limiter{},
		entries:    map[string]entry{},
		flights:    map[string]*flight{},
		coolBase:   o.coolBase,
		coolMax:    o.coolMax,
		statsEvery: o.statsEvery,
		now:        time.Now,
	}
}

// ListenAndServe serves the gateway on addr until ctx is cancelled, logging one
// stats line every statsEvery. The upstream URL is never printed — only its host.
func (g *Gateway) ListenAndServe(ctx context.Context, addr string) error {
	srv := &http.Server{
		Addr: addr, Handler: g,
		ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second,
		// no WriteTimeout: a caller may legitimately wait out a cool-down + queue
	}
	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe() }()
	go g.statsLoop(ctx)
	host := "upstream"
	if u, err := url.Parse(g.upstream); err == nil && u.Host != "" {
		host = u.Host
	}
	g.log.Info("rpc gateway listening", "addr", addr, "upstream_host", host)
	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return fmt.Errorf("listen %s: %w", addr, err)
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
}

func (g *Gateway) statsLoop(ctx context.Context) {
	t := time.NewTicker(g.statsEvery)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			g.logStats()
		}
	}
}

// ServeHTTP answers one JSON-RPC request (or batch) from a local caller.
func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "rpc gateway: POST only", http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<20))
	if err != nil {
		http.Error(w, "rpc gateway: read body: "+err.Error(), http.StatusBadRequest)
		return
	}
	if bytes.HasPrefix(bytes.TrimSpace(body), []byte("[")) {
		g.serveBatch(w, r, body)
		return
	}
	g.serveSingle(w, r, body)
}

func (g *Gateway) serveSingle(w http.ResponseWriter, r *http.Request, body []byte) {
	var req rpcReq
	if err := json.Unmarshal(body, &req); err != nil || req.Method == "" {
		writeErr(w, req.ID, -32600, "rpc gateway: invalid json-rpc request")
		return
	}
	key := req.Method + "\n" + canonical(req.Params)
	if ttl, ok := ttlByMethod[req.Method]; ok {
		if e, ok := g.cached(key, ttl); ok {
			g.cacheHits.Add(1)
			writeResult(w, req.ID, e.result, nil)
			return
		}
	}
	fl, leader := g.join(key)
	if !leader { // an identical request is already in flight — share its answer
		g.shared.Add(1)
		select {
		case <-fl.done:
		case <-r.Context().Done():
			return
		}
		g.deliver(w, req.ID, fl)
		return
	}
	if ttl, ok := ttlByMethod[req.Method]; ok { // a flight may have finished since the cache check
		if e, ok := g.cached(key, ttl); ok {
			g.cacheHits.Add(1)
			g.flightDone(key, fl)
			writeResult(w, req.ID, e.result, nil)
			return
		}
	}
	fl.status, fl.body, fl.parsed, fl.err = g.callUpstream(r.Context(), req.Method, body, 1)
	if fl.err == nil && fl.parsed != nil && fl.parsed.Error == nil {
		g.maybeStore(key, req.Method, fl.parsed.Result)
	}
	g.flightDone(key, fl)
	g.deliver(w, req.ID, fl)
}

// serveBatch forwards a JSON-RPC batch uncached, costing one total token per
// element (our clients never batch; correctness over cleverness here).
func (g *Gateway) serveBatch(w http.ResponseWriter, r *http.Request, body []byte) {
	var elems []json.RawMessage
	if err := json.Unmarshal(body, &elems); err != nil || len(elems) == 0 {
		writeErr(w, nil, -32600, "rpc gateway: invalid json-rpc batch")
		return
	}
	status, raw, parsed, err := g.callUpstream(r.Context(), "batch", body, len(elems))
	g.deliver(w, nil, &flight{status: status, body: raw, parsed: parsed, err: err})
}

// deliver writes a finished upstream answer to the caller, re-wrapped with the
// caller's id when it is a JSON-RPC object; anything else (non-200 status, a
// body that is not JSON-RPC, a 429 that survived every retry) is forwarded
// unchanged.
func (g *Gateway) deliver(w http.ResponseWriter, id json.RawMessage, fl *flight) {
	if fl.err != nil {
		writeErr(w, id, -32603, fl.err.Error())
		return
	}
	if fl.parsed != nil {
		if fl.parsed.Error != nil {
			writeResult(w, id, nil, fl.parsed.Error)
			return
		}
		writeResult(w, id, fl.parsed.Result, nil)
		return
	}
	w.WriteHeader(fl.status)
	_, _ = w.Write(fl.body)
}

// callUpstream performs the paced upstream round-trips for one caller request,
// retrying rate-limited answers (HTTP 429 or JSON-RPC error 429) after the
// gateway-wide cool-down, up to maxTries within the caller's deadline. Other
// upstream failures are returned to the caller unchanged.
func (g *Gateway) callUpstream(ctx context.Context, method string, body []byte, tokens int) (int, []byte, *rpcResp, error) {
	var status int
	var raw []byte
	var parsed *rpcResp
	for try := 1; try <= maxTries; try++ {
		if err := g.coolWait(ctx); err != nil {
			return 0, nil, nil, err
		}
		if err := g.pace(ctx, method, tokens); err != nil {
			return 0, nil, nil, err
		}
		var err error
		status, raw, parsed, err = g.post(ctx, method, body)
		if err != nil {
			return 0, nil, nil, err
		}
		rpc429 := parsed != nil && parsed.Error != nil && parsed.Error.Code == http.StatusTooManyRequests
		if status != http.StatusTooManyRequests && !rpc429 {
			if parsed != nil && parsed.Error == nil {
				g.coolReset()
			}
			return status, raw, parsed, nil
		}
		g.rateLimited.Add(1)
		g.log.Warn("rpc gateway: upstream rate-limited, cooling down", "method", method, "try", try)
		g.armCoolDown()
	}
	return status, raw, parsed, nil
}

// post is one upstream HTTP round-trip.
func (g *Gateway) post(ctx context.Context, method string, body []byte) (int, []byte, *rpcResp, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.upstream, bytes.NewReader(body))
	if err != nil {
		return 0, nil, nil, fmt.Errorf("build upstream request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := g.do(req)
	if err != nil {
		return 0, nil, nil, fmt.Errorf("upstream: %w", err) // g.do drops the URL (api-key!)
	}
	defer func() { _ = resp.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 128<<20))
	if err != nil {
		return 0, nil, nil, fmt.Errorf("read upstream body: %w", err)
	}
	g.upstreamCalls.Add(1)
	g.countMethod(method)
	var parsed *rpcResp
	if resp.StatusCode == http.StatusOK {
		var p rpcResp
		if json.Unmarshal(raw, &p) == nil {
			parsed = &p
		}
	}
	return resp.StatusCode, raw, parsed, nil
}

// maybeStore caches a successful result for its method's TTL and clears the
// account-state entries after every successful sendTransaction.
func (g *Gateway) maybeStore(key, method string, result json.RawMessage) {
	if method == "sendTransaction" {
		g.mu.Lock()
		for k, e := range g.entries {
			if e.ttl == ttlAccountState {
				delete(g.entries, k)
			}
		}
		g.mu.Unlock()
		return
	}
	ttl, ok := ttlByMethod[method]
	if !ok {
		return
	}
	if method == "getTransaction" && isNull(result) {
		return // null = "not indexed yet": caching it would hide the tx for 10 min
	}
	// Clone out of the upstream body buffer: entries outlive the round-trip and
	// must not pin the whole (potentially large) response in memory.
	res := json.RawMessage(bytes.Clone(result))
	g.mu.Lock()
	g.entries[key] = entry{result: res, at: g.now(), ttl: ttl}
	if ttl == ttlTx {
		g.txKeys = append(g.txKeys, key)
		for len(g.txKeys) > txCacheBound { // bound the 10-minute group
			old := g.txKeys[0]
			g.txKeys = g.txKeys[1:]
			if e, ok := g.entries[old]; ok && e.ttl == ttlTx && old != key {
				delete(g.entries, old)
			}
		}
	}
	g.mu.Unlock()
}

func (g *Gateway) cached(key string, ttl time.Duration) (entry, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	e, ok := g.entries[key]
	if !ok || e.ttl != ttl || g.now().Sub(e.at) >= ttl {
		return entry{}, false
	}
	return e, true
}

func (g *Gateway) join(key string) (*flight, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if fl, ok := g.flights[key]; ok {
		return fl, false
	}
	fl := &flight{done: make(chan struct{})}
	g.flights[key] = fl
	return fl, true
}

func (g *Gateway) flightDone(key string, fl *flight) {
	g.mu.Lock()
	if g.flights[key] == fl {
		delete(g.flights, key)
	}
	g.mu.Unlock()
	close(fl.done)
}

// pace waits for a total token and the method's token (FIFO inside each
// limiter) or the caller's deadline — an over-budget request is never refused.
func (g *Gateway) pace(ctx context.Context, method string, tokens int) error {
	start := time.Now()
	if err := waitN(ctx, g.total, tokens); err != nil {
		return err
	}
	if err := g.methodLimiter(method).Wait(ctx); err != nil {
		return fmt.Errorf("pace: %w", err)
	}
	if d := int64(time.Since(start)); d > 0 {
		for {
			old := g.maxQueueWait.Load()
			if d <= old || g.maxQueueWait.CompareAndSwap(old, d) {
				break
			}
		}
	}
	return nil
}

// waitN takes n tokens in burst-sized chunks (rate.Limiter refuses n > burst).
func waitN(ctx context.Context, l *rate.Limiter, n int) error {
	for n > 0 {
		k := min(n, l.Burst())
		if err := l.WaitN(ctx, k); err != nil {
			return fmt.Errorf("pace: %w", err)
		}
		n -= k
	}
	return nil
}

func (g *Gateway) methodLimiter(method string) *rate.Limiter {
	g.perMu.Lock()
	defer g.perMu.Unlock()
	l, ok := g.per[method]
	if !ok {
		l = rate.NewLimiter(g.perRate, g.perBurst)
		g.per[method] = l
	}
	return l
}

// armCoolDown extends the gateway-wide 429 gate: no upstream request starts
// before it opens. The wait doubles per consecutive 429 up to coolMax, ±25%
// jitter; any success resets the doubling.
func (g *Gateway) armCoolDown() {
	g.coolMu.Lock()
	defer g.coolMu.Unlock()
	wait := jitter(min(g.coolBase<<g.coolLevel, g.coolMax))
	if until := g.now().Add(wait); until.After(g.coolUntil) {
		g.coolUntil = until
	}
	if g.coolBase<<g.coolLevel < g.coolMax {
		g.coolLevel++
	}
}

func (g *Gateway) coolReset() {
	g.coolMu.Lock()
	g.coolLevel = 0
	g.coolMu.Unlock()
}

func (g *Gateway) coolWait(ctx context.Context) error {
	for {
		g.coolMu.Lock()
		d := time.Until(g.coolUntil)
		g.coolMu.Unlock()
		if d <= 0 {
			return nil
		}
		t := time.NewTimer(d)
		select {
		case <-ctx.Done():
			t.Stop()
			return fmt.Errorf("cool-down: %w", ctx.Err())
		case <-t.C:
		}
	}
}

func jitter(d time.Duration) time.Duration {
	return max(time.Duration(float64(d)*(0.75+0.5*rand.Float64())), time.Millisecond)
}

func (g *Gateway) countMethod(method string) {
	v, _ := g.methods.LoadOrStore(method, &atomic.Int64{})
	v.(*atomic.Int64).Add(1)
}

// logStats emits the one-line-per-minute health signal and sweeps expired
// cache entries (keys nobody asks for again must not accumulate).
func (g *Gateway) logStats() {
	type methodStat struct {
		name string
		n    int64
	}
	var ms []methodStat
	g.methods.Range(func(k, v any) bool {
		if n := v.(*atomic.Int64).Swap(0); n > 0 {
			ms = append(ms, methodStat{k.(string), n})
		}
		return true
	})
	slices.SortFunc(ms, func(a, b methodStat) int { return cmp.Compare(b.n, a.n) })
	top := make([]string, 0, min(5, len(ms)))
	for _, m := range ms[:min(5, len(ms))] {
		top = append(top, fmt.Sprintf("%s:%d", m.name, m.n))
	}
	wait := time.Duration(g.maxQueueWait.Swap(0))
	g.log.Info("rpc gateway",
		"upstream_calls", g.upstreamCalls.Swap(0),
		"cache_hits", g.cacheHits.Swap(0),
		"singleflight_shares", g.shared.Swap(0),
		"rate_limited_429", g.rateLimited.Swap(0),
		"max_queue_wait_ms", wait.Milliseconds(),
		"top_methods", strings.Join(top, " "))
	g.sweep()
}

func (g *Gateway) sweep() {
	now := g.now()
	g.mu.Lock()
	for k, e := range g.entries {
		if now.Sub(e.at) >= e.ttl {
			delete(g.entries, k)
		}
	}
	g.txKeys = slices.DeleteFunc(g.txKeys, func(k string) bool {
		_, ok := g.entries[k]
		return !ok
	})
	g.mu.Unlock()
}

// canonical compacts the params JSON so whitespace-only differences share one
// cache entry.
func canonical(p json.RawMessage) string {
	var buf bytes.Buffer
	if err := json.Compact(&buf, p); err != nil {
		return string(p)
	}
	return buf.String()
}

func isNull(raw json.RawMessage) bool { return bytes.Equal(bytes.TrimSpace(raw), []byte("null")) }

func writeResult(w http.ResponseWriter, id, result json.RawMessage, rpcErr *rpcErr) {
	writeJSON(w, rpcResp{JSONRPC: "2.0", ID: id, Result: result, Error: rpcErr})
}

func writeErr(w http.ResponseWriter, id json.RawMessage, code int, msg string) {
	writeJSON(w, rpcResp{JSONRPC: "2.0", ID: id, Error: &rpcErr{Code: code, Message: msg}})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// do is hc.Do with the URL redacted out of transport errors: http.Client wraps
// them in *url.Error carrying the full upstream URL, query string included —
// the api-key must never reach logs or response bodies.
func (g *Gateway) do(req *http.Request) (*http.Response, error) {
	resp, err := g.hc.Do(req)
	if err != nil {
		var uerr *url.Error
		if errors.As(err, &uerr) {
			host := uerr.URL
			if u, perr := url.Parse(uerr.URL); perr == nil && u.Host != "" {
				host = u.Host
			}
			err = &url.Error{Op: uerr.Op, URL: host, Err: uerr.Err}
		}
	}
	return resp, err
}
