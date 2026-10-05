package ingest

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	solana "github.com/solana-foundation/solana-go/v2"
	"github.com/solana-foundation/solana-go/v2/rpc"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

const (
	sig1 = "3aMjwVRksrEYb3DD8YgbGNciwZGxbTyYJBr2AoniXk5DmxBRRERzLTkXfgHVxaaHZdxbZ9hifift3L2a5z4ak33s" // newest, success
	sig2 = "4EjuQ55ftJD99eMGphR1cXV3TnVKQEpzgHVsWnqSsiGj9RDgkkXaSEJ6oYSVJupLcv3gEdBpJPcseVtvPzGQ6U3q" // failed, skipped
)

// fakeRPC answers getSignaturesForAddress and getTransaction like a devnet node.
func fakeRPC(t *testing.T, program solana.PublicKey, logs []string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string            `json:"method"`
			Params []json.RawMessage `json:"params"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("decode rpc request: %v", err)
		}
		writeResult := func(v any) {
			_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "result": v})
		}
		switch req.Method {
		case "getSignaturesForAddress":
			writeResult([]map[string]any{
				{"signature": sig1, "slot": 312, "err": nil, "blockTime": 1767230300},
				{"signature": sig2, "slot": 311, "err": map[string]any{"InstructionError": []any{0, "CustomError"}}},
			})
		case "getTransaction":
			var sig string
			_ = json.Unmarshal(req.Params[0], &sig)
			if sig != sig1 {
				writeResult(nil)
				return
			}
			writeResult(map[string]any{
				"slot": 312, "blockTime": 1767230300,
				"meta": map[string]any{"err": nil, "logMessages": logs},
			})
		default:
			t.Errorf("unexpected rpc method %q", req.Method)
		}
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func newPoller(t *testing.T, rpcURL string) (*Poller, *store.Store) {
	t.Helper()
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "ingest.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	program := solana.MustPublicKeyFromBase58("QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd")
	p := NewPoller(rpcURL, program, st, slog.New(slog.DiscardHandler))
	p.fallback = nil // tests never reach public devnet
	return p, st
}

func TestPollIngestsEventsInOrder(t *testing.T) {
	srv := fakeRPC(t, solana.MustPublicKeyFromBase58("QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd"), fixtureLogs(t))
	p, st := newPoller(t, srv.URL)

	if err := p.Poll(t.Context()); err != nil {
		t.Fatalf("poll: %v", err)
	}
	rows, err := st.ListActivity(t.Context(), 100)
	if err != nil {
		t.Fatalf("list activity: %v", err)
	}
	wantKinds := []string{"SeriesInitialized", "Subscribed", "ActionFunded", "HolderSnapshotted"}
	if len(rows) != len(wantKinds) {
		t.Fatalf("rows = %d, want %d (failed tx %s must be skipped): %+v", len(rows), len(wantKinds), sig2, rows)
	}
	for i, want := range wantKinds {
		got := rows[i]
		if got.Kind != want {
			t.Errorf("row[%d].Kind = %s, want %s", i, got.Kind, want)
		}
		if got.Sig != sig1 {
			t.Errorf("row[%d].Sig = %s, want %s", i, got.Sig, sig1)
		}
		if got.Seq != i {
			t.Errorf("row[%d].Seq = %d, want %d", i, got.Seq, i)
		}
		if got.Ts != 1767230300 {
			t.Errorf("row[%d].Ts = %d, want blockTime 1767230300", i, got.Ts)
		}
		if got.SeriesMint == nil || *got.SeriesMint != fixSeries {
			t.Errorf("row[%d].SeriesMint = %v, want %s", i, got.SeriesMint, fixSeries)
		}
	}
	// action only on action-scoped events
	for i, want := range []bool{false, false, true, true} {
		if (rows[i].ActionPDA != nil) != want {
			t.Errorf("row[%d] (%s).ActionPDA set = %v, want %v", i, rows[i].Kind, rows[i].ActionPDA != nil, want)
		}
	}

	// cursor persisted to the newest signature
	cur, err := st.IngestCursor(t.Context())
	if err != nil {
		t.Fatalf("cursor: %v", err)
	}
	if cur != sig1 {
		t.Errorf("cursor = %s, want %s", cur, sig1)
	}

	// re-poll: same signatures again → dedupe, no new rows
	if err := p.Poll(t.Context()); err != nil {
		t.Fatalf("second poll: %v", err)
	}
	rows2, err := st.ListActivity(t.Context(), 100)
	if err != nil {
		t.Fatalf("list activity 2: %v", err)
	}
	if len(rows2) != len(rows) {
		t.Errorf("rows after re-poll = %d, want %d (idempotent)", len(rows2), len(rows))
	}
}

func TestPollNoSignatures(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "result": []any{}})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	p, st := newPoller(t, srv.URL)

	if err := p.Poll(t.Context()); err != nil {
		t.Fatalf("poll: %v", err)
	}
	rows, err := st.ListActivity(t.Context(), 100)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != 0 {
		t.Errorf("rows = %d, want 0", len(rows))
	}
	if cur, _ := st.IngestCursor(t.Context()); cur != "" {
		t.Errorf("cursor = %q, want empty", cur)
	}
}

func TestPollRPCErrorLeavesCursor(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":{"message":"boom"}}`))
	}))
	defer srv.Close()
	p, st := newPoller(t, srv.URL)

	if err := p.Poll(t.Context()); err == nil {
		t.Fatal("poll succeeded, want error")
	}
	if cur, _ := st.IngestCursor(t.Context()); cur != "" {
		t.Errorf("cursor = %q, want empty after failure", cur)
	}
}

// A primary that fails history calls is backed by the fallback RPC (public devnet in production).
func TestPollFallsBackWhenPrimaryFailsHistory(t *testing.T) {
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"Internal error"}}`))
	}))
	defer primary.Close()
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":[]}`))
	}))
	defer fallback.Close()
	p, _ := newPoller(t, primary.URL)
	p.fallback = rpc.New(fallback.URL)
	if err := p.Poll(t.Context()); err != nil {
		t.Fatalf("poll with fallback: %v", err)
	}
}

// fakeSigs returns n distinct valid signature strings (base58 of 64 bytes).
func fakeSigs(n int) []string {
	out := make([]string, n)
	for i := range out {
		var s solana.Signature
		s[0] = byte(i + 1)
		s[63] = byte(255 - i)
		out[i] = s.String()
	}
	return out
}

// pagedRPC mimics getSignaturesForAddress paging: `sigs` is newest-first, the
// handler honors `before`/`until`/`limit` exactly like a devnet node, and
// getTransaction returns `logs` for every signature.
func pagedRPC(t *testing.T, sigs []string, logs []string, calls *int) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string            `json:"method"`
			Params []json.RawMessage `json:"params"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("decode rpc request: %v", err)
		}
		writeResult := func(v any) {
			_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "result": v})
		}
		idx := func(sig string) int { // -1 when absent
			for i, s := range sigs {
				if s == sig {
					return i
				}
			}
			return -1
		}
		switch req.Method {
		case "getSignaturesForAddress":
			*calls++
			var opts struct {
				Before string `json:"before"`
				Until  string `json:"until"`
				Limit  int    `json:"limit"`
			}
			_ = json.Unmarshal(req.Params[1], &opts)
			start, end := 0, len(sigs)
			if opts.Before != "" && idx(opts.Before) >= 0 {
				start = idx(opts.Before) + 1
			}
			if opts.Until != "" && idx(opts.Until) >= 0 {
				end = idx(opts.Until) // exclusive, like the RPC
			}
			page := sigs[start:min(end, len(sigs))]
			if opts.Limit > 0 && len(page) > opts.Limit {
				page = page[:opts.Limit]
			}
			items := make([]map[string]any, len(page))
			for i, s := range page {
				items[i] = map[string]any{"signature": s, "slot": 300 + i, "err": nil, "blockTime": 1767230300}
			}
			writeResult(items)
		case "getTransaction":
			writeResult(map[string]any{
				"slot": 312, "blockTime": 1767230300,
				"meta": map[string]any{"err": nil, "logMessages": logs},
			})
		default:
			t.Errorf("unexpected rpc method %q", req.Method)
		}
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestPollBackfillsToCursorAcrossPages(t *testing.T) {
	// newest first; the cursor is older than every signature here
	var cursorSig solana.Signature
	cursorSig[0] = 99 // distinct from fakeSigs bytes (1..n)
	cursor, sigs := cursorSig.String(), fakeSigs(6)
	var calls int
	// 6 signatures over 3 pages of 2: the cap must NOT apply once a cursor exists
	srv := pagedRPC(t, sigs, fixtureLogs(t), &calls)
	p, st := newPoller(t, srv.URL)
	p.pageSize = 2
	p.backfillCap = 3
	if err := st.SetIngestCursor(t.Context(), cursor); err != nil {
		t.Fatalf("set cursor: %v", err)
	}

	if err := p.Poll(t.Context()); err != nil {
		t.Fatalf("poll: %v", err)
	}
	rows, err := st.ListActivity(t.Context(), 100)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	seen := map[string]bool{}
	for _, row := range rows {
		seen[row.Sig] = true
	}
	for _, s := range sigs {
		if !seen[s] {
			t.Errorf("signature %s missing from activity (skipped)", s)
		}
	}
	if len(rows) != 6*4 { // every tx carries the 4 fixture events
		t.Fatalf("rows = %d, want %d", len(rows), 6*4)
	}
	// chain order: first row belongs to the oldest signature, last to the newest
	if rows[0].Sig != sigs[len(sigs)-1] || rows[len(rows)-1].Sig != sigs[0] {
		t.Errorf("order wrong: first=%s last=%s", rows[0].Sig, rows[len(rows)-1].Sig)
	}
	if cur, _ := st.IngestCursor(t.Context()); cur != sigs[0] {
		t.Errorf("cursor = %s, want newest %s", cur, sigs[0])
	}
	if calls != 4 { // 3 data pages + 1 empty page proves paging with `before`
		t.Errorf("getSignaturesForAddress calls = %d, want 4", calls)
	}
}

func TestPollFirstRunCapsBackfill(t *testing.T) {
	sigs := fakeSigs(6) // newest first
	var calls int
	srv := pagedRPC(t, sigs, fixtureLogs(t), &calls)
	p, st := newPoller(t, srv.URL) // empty cursor: first run
	p.pageSize = 2
	p.backfillCap = 3

	if err := p.Poll(t.Context()); err != nil {
		t.Fatalf("poll: %v", err)
	}
	rows, err := st.ListActivity(t.Context(), 100)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	seen := map[string]bool{}
	for _, row := range rows {
		seen[row.Sig] = true
	}
	if len(seen) != 4 { // cap 3 with pageSize 2 stops after 2 full pages
		t.Errorf("distinct txs = %d, want 4 (cap page-quantized): %v", len(seen), seen)
	}
	if !seen[sigs[0]] {
		t.Errorf("newest signature missing")
	}
	if seen[sigs[4]] || seen[sigs[5]] {
		t.Errorf("older-than-cap signatures ingested on first run: %v", seen)
	}
}
