package chain

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"
	"github.com/solana-foundation/solana-go/v2/rpc"
	"github.com/solana-foundation/solana-go/v2/rpc/jsonrpc"
)

const testProgram = "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd"

func testClient(t *testing.T, url string) *Client {
	t.Helper()
	return NewClient(url, pk(t, testProgram), slog.New(slog.DiscardHandler))
}

// accountValueJSON is the Account object inside RPC results.
func accountValueJSON(t *testing.T, data []byte) map[string]any {
	t.Helper()
	return map[string]any{
		"data":       []string{base64.StdEncoding.EncodeToString(data), "base64"},
		"executable": false,
		"lamports":   1,
		"owner":      testProgram,
		"rentEpoch":  0,
	}
}

// accountJSON is one getProgramAccounts result entry.
func accountJSON(t *testing.T, addr solana.PublicKey, data []byte) map[string]any {
	t.Helper()
	return map[string]any{
		"pubkey":  addr.String(),
		"account": accountValueJSON(t, data),
	}
}

func TestGetProgramAccountsDecodesSeries(t *testing.T) {
	want := &Series{
		Bump:          254,
		Mint:          pk(t, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"),
		CashMint:      pk(t, "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
		FaceValue:     100_000,
		CouponRateBps: 1000,
		Frequency:     2,
		IssueDate:     1_770_000_000,
		MaturityDate:  1_803_542_400,
		TotalIssued:   10_000,
	}
	pda := pk(t, "AVMoJ7VrsMQ8tPjxWZYeDb9nXZuVhxzXb2S2QZKtcHq")
	disc, err := AccountDiscriminator("Series")
	if err != nil {
		t.Fatal(err)
	}
	data := append(append([]byte{}, disc[:]...), encodeSeries(want)...)

	var gotFilters []rpc.RPCFilter
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string            `json:"method"`
			Params []json.RawMessage `json:"params"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("decode request: %v", err)
		}
		var opts struct {
			Filters []rpc.RPCFilter `json:"filters"`
		}
		if err := json.Unmarshal(req.Params[1], &opts); err != nil {
			t.Errorf("decode opts: %v", err)
		}
		gotFilters = opts.Filters
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"result": []map[string]any{accountJSON(t, pda, data)},
		})
	}))
	defer srv.Close()

	cl := testClient(t, srv.URL)
	recs, err := cl.AllSeries(t.Context())
	if err != nil {
		t.Fatalf("AllSeries: %v", err)
	}
	if len(recs) != 1 {
		t.Fatalf("got %d series, want 1", len(recs))
	}
	if recs[0].PDA != pda {
		t.Errorf("pda = %s, want %s", recs[0].PDA, pda)
	}
	if *recs[0].Series != *want {
		t.Errorf("series mismatch:\n got %+v\nwant %+v", *recs[0].Series, *want)
	}
	// Filter must carry the discriminator at offset 0 and no dataSize filter.
	if len(gotFilters) != 1 || gotFilters[0].Memcmp == nil {
		t.Fatalf("filters = %+v, want one memcmp", gotFilters)
	}
	if gotFilters[0].Memcmp.Offset != 0 || !bytes.Equal([]byte(gotFilters[0].Memcmp.Bytes), disc[:]) {
		t.Errorf("memcmp = offset %d bytes %x", gotFilters[0].Memcmp.Offset, []byte(gotFilters[0].Memcmp.Bytes))
	}
}

func TestGetProgramAccountsPassesMemcmpFilters(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Params []json.RawMessage `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		var opts struct {
			Filters []rpc.RPCFilter `json:"filters"`
		}
		_ = json.Unmarshal(req.Params[1], &opts)
		if len(opts.Filters) != 2 { // discriminator + caller filter
			t.Errorf("filters = %d, want 2", len(opts.Filters))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": []any{}})
	}))
	defer srv.Close()

	cl := testClient(t, srv.URL)
	disc, _ := AccountDiscriminator("Investor")
	series := pk(t, testProgram)
	if _, err := cl.GetProgramAccounts(t.Context(), disc,
		[]rpc.RPCFilterMemcmp{{Offset: 9, Bytes: solana.Base58(series[:])}}); err != nil {
		t.Fatalf("GetProgramAccounts: %v", err)
	}
}

func TestGetAccountRetriesTransportError(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"result": map[string]any{
				"context": map[string]any{"slot": 1},
				"value":   accountValueJSON(t, []byte("hello")),
			},
		})
	}))
	defer srv.Close()

	cl := testClient(t, srv.URL)
	data, err := cl.GetAccount(t.Context(), pk(t, testProgram))
	if err != nil {
		t.Fatalf("GetAccount: %v", err)
	}
	if string(data) != "hello" {
		t.Errorf("data = %q, want %q", data, "hello")
	}
	if n := calls.Load(); n != 2 {
		t.Errorf("calls = %d, want 2 (one retry)", n)
	}
}

func TestGetAccountMissingYieldsNil(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"result": map[string]any{"context": map[string]any{"slot": 1}, "value": nil},
		})
	}))
	defer srv.Close()

	cl := testClient(t, srv.URL)
	data, err := cl.GetAccount(t.Context(), pk(t, testProgram))
	if err != nil || data != nil {
		t.Fatalf("GetAccount = (%q, %v), want (nil, nil)", data, err)
	}
	if n := calls.Load(); n != 1 { // not-found must not be retried
		t.Errorf("calls = %d, want 1", n)
	}
}

func TestFetchSeriesRejectsWrongDiscriminator(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"result": map[string]any{
				"context": map[string]any{"slot": 1},
				"value":   accountValueJSON(t, make([]byte, 16)),
			},
		})
	}))
	defer srv.Close()

	cl := testClient(t, srv.URL)
	if _, err := cl.FetchSeries(t.Context(), pk(t, testProgram)); err == nil {
		t.Fatal("expected discriminator mismatch error")
	}
}

func TestSeriesView(t *testing.T) {
	s := &Series{
		Mint:          pk(t, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"),
		CashMint:      pk(t, "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
		ISIN:          pad12("KZ2C0QUPON01"), // on-chain ISIN is [u8;12]
		Ticker:        pad16("QPNB1"),
		FaceValue:     100_000,
		CouponRateBps: 1000,
		Frequency:     2,
		DayCount:      0,
		Status:        0,
		TotalIssued:   10_000,
	}
	v := s.View(pk(t, testProgram))
	if v.ISIN != "KZ2C0QUPON01" || v.Ticker != "QPNB1" {
		t.Errorf("isin/ticker = %q/%q", v.ISIN, v.Ticker)
	}
	if v.Status != "Active" || v.DayCount != "THIRTY_360" {
		t.Errorf("status/dayCount = %q/%q", v.Status, v.DayCount)
	}
	if v.FaceValue != 100_000 || v.CouponRateBps != 1000 {
		t.Errorf("terms = %d bps %d", v.FaceValue, v.CouponRateBps)
	}
}

func TestFetchEntitlementsByActionFiltersAndSorts(t *testing.T) {
	action := pk(t, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")
	// Owners deliberately out of ascending order.
	ownerHi := pk(t, "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo")
	ownerLo := pk(t, "6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cveB7xX5M9rdC")
	disc, err := AccountDiscriminator("Entitlement")
	if err != nil {
		t.Fatal(err)
	}
	mk := func(owner solana.PublicKey, act solana.PublicKey, units uint64) map[string]any {
		ent := encodeEntitlement(&Entitlement{Action: act, Owner: owner, Units: units})
		data := append(append([]byte{}, disc[:]...), ent...)
		return accountValueJSON(t, data)
	}
	var gotFilters []rpc.RPCFilter
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Params []json.RawMessage `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		var opts struct {
			Filters []rpc.RPCFilter `json:"filters"`
		}
		_ = json.Unmarshal(req.Params[1], &opts)
		gotFilters = opts.Filters
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"result": []map[string]any{
				{"pubkey": "AVMoJ7VrsMQ8tPjxWZYeDb9nXZuVhxzXb2S2QZKtcHq", "account": mk(ownerHi, action, 65)},
				{"pubkey": "EiAZ7r9tVciGeibwdFmjbhhZVeSGXxY2CMuqP71MaN6g", "account": mk(ownerLo, action, 10)},
			},
		})
	}))
	defer srv.Close()

	cl := testClient(t, srv.URL)
	recs, err := cl.FetchEntitlementsByAction(t.Context(), action)
	if err != nil {
		t.Fatalf("FetchEntitlementsByAction: %v", err)
	}
	if len(recs) != 2 {
		t.Fatalf("got %d records, want 2", len(recs))
	}
	if recs[0].Entitlement.Owner != ownerLo || recs[1].Entitlement.Owner != ownerHi {
		t.Errorf("owners not sorted ascending: %s, %s",
			recs[0].Entitlement.Owner, recs[1].Entitlement.Owner)
	}
	// Filter must be discriminator at 0 + action key at offset 9 (bump u8 first).
	if len(gotFilters) != 2 {
		t.Fatalf("filters = %d, want 2", len(gotFilters))
	}
	if m := gotFilters[1].Memcmp; m == nil || m.Offset != 9 || solana.PublicKey(m.Bytes) != action {
		t.Errorf("action memcmp = %+v, want offset 9 key %s", gotFilters[1].Memcmp, action)
	}
}

func TestFetchActionMissingYieldsNil(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"result": map[string]any{"context": map[string]any{"slot": 1}, "value": nil},
		})
	}))
	defer srv.Close()

	cl := testClient(t, srv.URL)
	act, err := cl.FetchCorporateAction(t.Context(), pk(t, testProgram))
	if err != nil || act != nil {
		t.Fatalf("FetchCorporateAction = (%v, %v), want (nil, nil)", act, err)
	}
	ent, err := cl.FetchEntitlement(t.Context(), pk(t, testProgram))
	if err != nil || ent != nil {
		t.Fatalf("FetchEntitlement = (%v, %v), want (nil, nil)", ent, err)
	}
}

// Task 1525: the by-owner scans filter on the owner pubkey at offset 41 (discriminator + bump +
// series/action) and keep a deterministic order.
func TestFetchByOwnerMemcmpAndSort(t *testing.T) {
	owner := pk(t, "6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cveB7xX5M9rdC")
	invDisc, err := AccountDiscriminator("Investor")
	if err != nil {
		t.Fatal(err)
	}
	entDisc, err := AccountDiscriminator("Entitlement")
	if err != nil {
		t.Fatal(err)
	}
	actLo := pk(t, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM") // 0x39… sorts before 0x44…
	actHi := pk(t, "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo")
	var gotFilters []rpc.RPCFilter
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Params []json.RawMessage `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		var opts struct {
			Filters []rpc.RPCFilter `json:"filters"`
		}
		_ = json.Unmarshal(req.Params[1], &opts)
		gotFilters = opts.Filters
		rows := []map[string]any{}
		switch string(opts.Filters[0].Memcmp.Bytes) { // JSON round-trips Bytes back to the raw discriminator
		case string(invDisc[:]):
			rows = append(rows,
				accountJSON(t, pk(t, "AVMoJ7VrsMQ8tPjxWZYeDb9nXZuVhxzXb2S2QZKtcHq"),
					append(append([]byte{}, invDisc[:]...), encodeInvestor(&Investor{Series: actHi, Owner: owner})...)))
		case string(entDisc[:]):
			rows = append(rows,
				accountJSON(t, pk(t, "AVMoJ7VrsMQ8tPjxWZYeDb9nXZuVhxzXb2S2QZKtcHq"),
					append(append([]byte{}, entDisc[:]...), encodeEntitlement(&Entitlement{Action: actHi, Owner: owner, Units: 65})...)),
				accountJSON(t, pk(t, "EiAZ7r9tVciGeibwdFmjbhhZVeSGXxY2CMuqP71MaN6g"),
					append(append([]byte{}, entDisc[:]...), encodeEntitlement(&Entitlement{Action: actLo, Owner: owner, Units: 10})...)))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": rows})
	}))
	defer srv.Close()

	cl := testClient(t, srv.URL)
	ents, err := cl.FetchEntitlementsByOwner(t.Context(), owner)
	if err != nil {
		t.Fatalf("FetchEntitlementsByOwner: %v", err)
	}
	if len(ents) != 2 || ents[0].Entitlement.Action != actLo || ents[1].Entitlement.Action != actHi {
		t.Fatalf("entitlements not action-sorted: %+v", ents)
	}
	if m := gotFilters[1].Memcmp; m == nil || m.Offset != 41 || solana.PublicKey(m.Bytes) != owner {
		t.Errorf("owner memcmp = %+v, want offset 41 key %s", gotFilters[1].Memcmp, owner)
	}

	invs, err := cl.FetchInvestorsByOwner(t.Context(), owner)
	if err != nil {
		t.Fatalf("FetchInvestorsByOwner: %v", err)
	}
	if len(invs) != 1 || invs[0].Investor.Owner != owner {
		t.Fatalf("investors = %+v", invs)
	}
	if m := gotFilters[1].Memcmp; m == nil || m.Offset != 41 || solana.PublicKey(m.Bytes) != owner {
		t.Errorf("owner memcmp = %+v, want offset 41 key %s", gotFilters[1].Memcmp, owner)
	}
}

// One getMultipleAccounts serves the GetAccount calls that follow; an absent account stays (nil, nil).
func TestPrefetchServesGetAccount(t *testing.T) {
	present, absent := pk(t, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"), pk(t, "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo")
	var methods []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string `json:"method"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		methods = append(methods, req.Method)
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": map[string]any{
			"context": map[string]any{"slot": 1}, "value": []any{accountValueJSON(t, []byte{7, 8}), nil},
		}})
	}))
	defer srv.Close()

	cl := testClient(t, srv.URL)
	if err := cl.Prefetch(t.Context(), []solana.PublicKey{present, absent}); err != nil {
		t.Fatal(err)
	}
	if d, err := cl.GetAccount(t.Context(), present); err != nil || !bytes.Equal(d, []byte{7, 8}) {
		t.Fatalf("GetAccount(present) = (%v, %v)", d, err)
	}
	if d, err := cl.GetAccount(t.Context(), absent); err != nil || d != nil {
		t.Fatalf("GetAccount(absent) = (%v, %v), want (nil, nil)", d, err)
	}
	if len(methods) != 1 || methods[0] != "getMultipleAccounts" {
		t.Fatalf("RPC calls = %v, want one getMultipleAccounts", methods)
	}
}

// Public devnet answers its rate limit as a JSON-RPC error with code 429, not an HTTP 429.
func TestIsRateLimitedJSONRPC429(t *testing.T) {
	if !isRateLimited(fmt.Errorf("wrapped: %w", &jsonrpc.RPCError{Code: 429, Message: "Connection rate limits exceeded"})) {
		t.Fatal("JSON-RPC 429 not treated as rate limited")
	}
	if isRateLimited(&jsonrpc.RPCError{Code: -32603}) {
		t.Fatal("JSON-RPC -32603 treated as rate limited")
	}
}

// Task 91585: a 429 arms one client-wide cool-down, so a concurrent caller's
// first attempt also waits — the RPC IP actually cools down instead of being
// hammered by whichever caller has not been rate-limited yet.
func TestRateLimitCoolDownSharedAcrossCalls(t *testing.T) {
	const base = 40 * time.Millisecond // jitter low bound → ≥ 30 ms of quiet
	first429 := make(chan struct{})
	var once sync.Once
	var mu sync.Mutex
	var hitTimes []time.Duration
	start := time.Now()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := len(hitTimes) + 1
		mu.Lock()
		hitTimes = append(hitTimes, time.Since(start))
		mu.Unlock()
		if n == 1 {
			_ = json.NewEncoder(w).Encode(map[string]any{ // JSON-RPC 429, like public devnet
				"jsonrpc": "2.0", "id": 1,
				"error": map[string]any{"code": 429, "message": "Connection rate limits exceeded"},
			})
			once.Do(func() { close(first429) })
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"result": map[string]any{
				"context": map[string]any{"slot": 1},
				"value":   accountValueJSON(t, []byte("x")),
			},
		})
	}))
	defer srv.Close()

	cl := testClient(t, srv.URL)
	cl.rateLimitBase = base

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		if _, err := cl.GetAccount(t.Context(), pk(t, testProgram)); err != nil {
			t.Errorf("first GetAccount: %v", err)
		}
	}()
	<-first429
	for deadline := time.Now().Add(time.Second); ; { // the 429 arms the gate once the client reads it
		cl.cool.mu.Lock()
		armed := !cl.cool.until.IsZero()
		cl.cool.mu.Unlock()
		if armed {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("cool-down never armed after the 429")
		}
		time.Sleep(time.Millisecond)
	}
	wg.Add(1)
	go func() { // starts while the gate is closed → its first attempt must wait
		defer wg.Done()
		if _, err := cl.GetAccount(t.Context(), pk(t, testProgram)); err != nil {
			t.Errorf("second GetAccount: %v", err)
		}
	}()
	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	if len(hitTimes) < 3 {
		t.Fatalf("server hits = %d, want ≥ 3 (429, retry, gated call)", len(hitTimes))
	}
	if gap := hitTimes[1] - hitTimes[0]; gap < 25*time.Millisecond {
		t.Errorf("first hit after the 429 came after only %v, want ≥ 0.75×%v (cool-down not shared)", gap, base)
	}
}

// A non-429 failure keeps the quick linear retry and must not arm the cool-down.
func TestNon429FailureDoesNotCoolDown(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"result": map[string]any{
				"context": map[string]any{"slot": 1},
				"value":   accountValueJSON(t, []byte("y")),
			},
		})
	}))
	defer srv.Close()

	cl := testClient(t, srv.URL)
	cl.rateLimitBase = 40 * time.Millisecond
	if _, err := cl.GetAccount(t.Context(), pk(t, testProgram)); err != nil {
		t.Fatalf("GetAccount with one 500: %v", err)
	}
	cl.cool.mu.Lock()
	armed := !cl.cool.until.IsZero()
	cl.cool.mu.Unlock()
	if armed {
		t.Error("non-429 failure armed the cool-down")
	}

	t0 := time.Now() // gate closed → the next call hits the server immediately
	if _, err := cl.GetAccount(t.Context(), pk(t, testProgram)); err != nil {
		t.Fatalf("second GetAccount: %v", err)
	}
	if d := time.Since(t0); d > 20*time.Millisecond {
		t.Errorf("second GetAccount took %v, want immediate (no cool-down)", d)
	}
}

// Two callers prefetch side by side (the scheduler's tick and a /holders request): the second never evicts the first.
func TestPrefetchKeepsEarlierEntries(t *testing.T) {
	a, b := pk(t, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"), pk(t, "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo")
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": map[string]any{
			"context": map[string]any{"slot": 1}, "value": []any{accountValueJSON(t, []byte{byte(calls)})},
		}})
	}))
	defer srv.Close()

	cl := testClient(t, srv.URL)
	for _, k := range []solana.PublicKey{a, b} {
		if err := cl.Prefetch(t.Context(), []solana.PublicKey{k}); err != nil {
			t.Fatal(err)
		}
	}
	if d, err := cl.GetAccount(t.Context(), a); err != nil || !bytes.Equal(d, []byte{1}) {
		t.Fatalf("GetAccount(a) = (%v, %v), want [1] from the first prefetch", d, err)
	}
	if calls != 2 {
		t.Fatalf("RPC calls = %d, want 2 (both reads served from the prefetch)", calls)
	}
}
