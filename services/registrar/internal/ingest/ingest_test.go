package ingest

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	solana "github.com/solana-foundation/solana-go/v2"

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
	return NewPoller(rpcURL, program, st, slog.New(slog.DiscardHandler)), st
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
