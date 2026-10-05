package api

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/reconcile"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

func newTestServer(t *testing.T) (http.Handler, *store.Store) {
	t.Helper()
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "api.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return New(slog.New(slog.DiscardHandler), st, Deps{}), st
}

func TestHealthz(t *testing.T) {
	handler, _ := newTestServer(t)
	srv := httptest.NewServer(handler)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/healthz")
	if err != nil {
		t.Fatalf("get healthz: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("healthz status = %d, want 200", resp.StatusCode)
	}
}

func TestOpenAPI(t *testing.T) {
	handler, _ := newTestServer(t)
	srv := httptest.NewServer(handler)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/openapi.yaml")
	if err != nil {
		t.Fatalf("get openapi: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("openapi status = %d, want 200", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/yaml" {
		t.Fatalf("content-type = %q, want application/yaml", ct)
	}
}

func TestActivity(t *testing.T) {
	h, _ := newTestServer(t)
	srv := httptest.NewServer(h)
	defer srv.Close()

	// fresh store: empty ordered feed
	resp, err := http.Get(srv.URL + "/activity")
	if err != nil {
		t.Fatalf("get activity: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("activity status = %d, want 200", resp.StatusCode)
	}
	var out struct {
		Events []store.Activity `json:"events"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Events) != 0 {
		t.Fatalf("events = %d, want 0 on a fresh store", len(out.Events))
	}
}

func TestActivityLimit(t *testing.T) {
	h, _ := newTestServer(t)
	srv := httptest.NewServer(h)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/activity?limit=nope")
	if err != nil {
		t.Fatalf("get activity: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("activity status = %d, want 400", resp.StatusCode)
	}
}

func TestCORSLocalhost(t *testing.T) {
	handler, _ := newTestServer(t)
	srv := httptest.NewServer(handler)
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodOptions, srv.URL+"/series", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("options: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("allow-origin = %q", got)
	}
}

func TestSeriesEndpoint(t *testing.T) {
	handler, st := newTestServer(t)
	if err := st.UpsertSeries(t.Context(), "MintAAA", []byte(`{"ticker":"QPNB1"}`)); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if err := st.UpsertSeries(t.Context(), "MintAAA", []byte(`{"ticker":"QPNB1","faceValue":100000}`)); err != nil {
		t.Fatalf("re-upsert: %v", err)
	}
	if err := st.UpsertSeries(t.Context(), "MintZZZ", []byte(`{"ticker":"BTRKdemo"}`)); err != nil {
		t.Fatalf("upsert: %v", err)
	}

	srv := httptest.NewServer(handler)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/series")
	if err != nil {
		t.Fatalf("get /series: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	var rows []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2 (upsert replaces)", len(rows))
	}
	if rows[0]["ticker"] != "QPNB1" || rows[0]["faceValue"] != float64(100000) {
		t.Errorf("row0 = %v", rows[0])
	}
	if rows[1]["ticker"] != "BTRKdemo" {
		t.Errorf("row1 = %v (ordered by mint)", rows[1])
	}
}

func TestNoticeParamValidation(t *testing.T) {
	h, _ := newTestServer(t)
	srv := httptest.NewServer(h)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/actions/9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM/notice?lang=de")
	if err != nil {
		t.Fatalf("get notice: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad lang status = %d, want 400", resp.StatusCode)
	}

	resp, err = http.Get(srv.URL + "/actions/not-a-pk/notice")
	if err != nil {
		t.Fatalf("get notice: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad pda status = %d, want 400", resp.StatusCode)
	}

	// nil reader configured (newTestServer passes nil): 503
	resp, err = http.Get(srv.URL + "/actions/9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM/notice")
	if err != nil {
		t.Fatalf("get notice: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("nil reader status = %d, want 503", resp.StatusCode)
	}
}

// fakeReconcileReader serves the reconcile endpoint tests: one happy INTR
// action over a single 100-unit holder (brief coupon → 500 000 tiyn).
type fakeReconcileReader struct {
	found bool
}

var (
	recSeries = solana.PublicKey{8: 8}
	recMint   = solana.PublicKey{7: 7}
	recOwner  = solana.PublicKey{0: 1}
	recATA    = solana.PublicKey{0: 2}
)

func recHash() [32]byte {
	var buf [72]byte // zero prev ‖ zero owner ‖ units LE — sha256 chain over one holder
	copy(buf[32:64], recOwner[:])
	binary.LittleEndian.PutUint64(buf[64:], 100)
	return sha256.Sum256(buf[:])
}

func (f *fakeReconcileReader) FetchSeries(context.Context, solana.PublicKey) (*chain.Series, error) {
	return &chain.Series{Mint: recMint, FaceValue: 100_000}, nil
}

func (f *fakeReconcileReader) FetchCorporateAction(context.Context, solana.PublicKey) (*chain.CorporateAction, error) {
	if !f.found {
		return nil, nil
	}
	return &chain.CorporateAction{
		Series: recSeries, Status: 5, AccrualDays: 180, RateBps: 1000,
		SnapshotHash: recHash(), UnitsSnapshotted: 100, HoldersSnapshotted: 1,
		TotalGross: 500_000, TotalNet: 500_000,
	}, nil
}

func (f *fakeReconcileReader) FetchMint(context.Context, solana.PublicKey) (*chain.Mint, error) {
	return &chain.Mint{Supply: 100}, nil
}

func (f *fakeReconcileReader) FetchInvestorsBySeries(context.Context, solana.PublicKey) ([]chain.InvestorRecord, error) {
	return []chain.InvestorRecord{{Investor: &chain.Investor{Owner: recOwner, BondATA: recATA}}}, nil
}

func (f *fakeReconcileReader) FetchEntitlementsByAction(context.Context, solana.PublicKey) ([]chain.EntitlementRecord, error) {
	return []chain.EntitlementRecord{{Entitlement: &chain.Entitlement{
		Owner: recOwner, Units: 100, Gross: 500_000, Net: 500_000,
	}}}, nil
}

func (f *fakeReconcileReader) FetchTokenAccountAt(_ context.Context, addr solana.PublicKey, _ uint64) (*chain.TokenAccount, error) {
	if addr != recATA {
		return nil, nil
	}
	return &chain.TokenAccount{Mint: recMint, Owner: recOwner, Amount: 100}, nil
}

func TestReconcileEndpoint(t *testing.T) {
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "reconcile.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	handler := New(slog.New(slog.DiscardHandler), st, Deps{Reconcile: &fakeReconcileReader{found: true}})
	srv := httptest.NewServer(handler)
	defer srv.Close()

	pda := solana.PublicKey{9: 9}.String()

	// happy path: 200, ok:true, run row recorded with status ok.
	resp, err := http.Get(srv.URL + "/actions/" + pda + "/reconcile")
	if err != nil {
		t.Fatalf("get reconcile: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var rep reconcile.Report
	if err := json.NewDecoder(resp.Body).Decode(&rep); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !rep.Ok || rep.Holders != 1 || rep.ExpectedTotals.Gross != 500_000 {
		t.Fatalf("report = ok:%v holders:%d gross:%d, want ok:true 1 500000",
			rep.Ok, rep.Holders, rep.ExpectedTotals.Gross)
	}

	// 400 on a malformed pda.
	resp2, err := http.Get(srv.URL + "/actions/notabase58/reconcile")
	if err != nil {
		t.Fatalf("get bad pda: %v", err)
	}
	defer func() { _ = resp2.Body.Close() }()
	if resp2.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad pda status = %d, want 400", resp2.StatusCode)
	}

	// 404 when the action account is absent.
	srv404 := httptest.NewServer(New(slog.New(slog.DiscardHandler), st, Deps{Reconcile: &fakeReconcileReader{found: false}}))
	defer srv404.Close()
	resp3, err := http.Get(srv404.URL + "/actions/" + pda + "/reconcile")
	if err != nil {
		t.Fatalf("get missing action: %v", err)
	}
	defer func() { _ = resp3.Body.Close() }()
	if resp3.StatusCode != http.StatusNotFound {
		t.Fatalf("missing action status = %d, want 404", resp3.StatusCode)
	}
}

func TestReconcileEndpointNoReader(t *testing.T) {
	handler, _ := newTestServer(t) // nil reader: PROGRAM_ID unset
	srv := httptest.NewServer(handler)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/actions/" + solana.PublicKey{9: 9}.String() + "/reconcile")
	if err != nil {
		t.Fatalf("get reconcile: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", resp.StatusCode)
	}
}
