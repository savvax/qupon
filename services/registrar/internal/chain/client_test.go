package chain

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	solana "github.com/solana-foundation/solana-go/v2"
	"github.com/solana-foundation/solana-go/v2/rpc"
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
