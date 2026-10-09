package api

// POST /actions/{pda}/advance end-to-end with a fake CLI binary: a demo INTR
// action walks Announced → … → Completed step by step, each POST running one
// CLI command (argv asserted via the fake's log) and re-reading the "chain"
// (a mutable fake read model the test advances between calls, exactly what
// devnet would do). CLI failures must surface as 409 with the CLI message.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// fakeChain is a ReadModel over one mutable action (the test plays devnet).
type fakeChain struct {
	action *chain.CorporateAction
}

func (f *fakeChain) AllSeries(context.Context) ([]chain.SeriesRecord, error) {
	return nil, nil
}
func (f *fakeChain) SeriesPDA(solana.PublicKey) (solana.PublicKey, error) {
	return fSeries, nil
}
func (f *fakeChain) FetchSeries(context.Context, solana.PublicKey) (*chain.Series, error) {
	s := (&fakeRead{}).series()
	return s, nil
}
func (f *fakeChain) FetchCorporateAction(_ context.Context, pda solana.PublicKey) (*chain.CorporateAction, error) {
	if pda == fAction {
		return f.action, nil
	}
	return nil, nil
}
func (f *fakeChain) FetchActionsBySeries(context.Context, solana.PublicKey) ([]chain.ActionRecord, error) {
	return []chain.ActionRecord{{PDA: fAction, Action: f.action}}, nil
}
func (f *fakeChain) FetchInvestorsBySeries(context.Context, solana.PublicKey) ([]chain.InvestorRecord, error) {
	return []chain.InvestorRecord{{Investor: &chain.Investor{Series: fSeries, Owner: fOwnerA, BondATA: fBondATAA}}}, nil
}
func (f *fakeChain) FetchEntitlementsByAction(context.Context, solana.PublicKey) ([]chain.EntitlementRecord, error) {
	return nil, nil
}
func (f *fakeChain) FetchTokenAccount(context.Context, solana.PublicKey) (*chain.TokenAccount, error) {
	return nil, nil
}
func (f *fakeChain) FetchMint(context.Context, solana.PublicKey) (*chain.Mint, error) {
	return &chain.Mint{Decimals: 2, Supply: 100}, nil
}

// advanceServer builds the API with a fake chain and the fake CLI.
func advanceServer(t *testing.T, fc *fakeChain) (*httptest.Server, *store.Store, string) {
	t.Helper()
	dir := t.TempDir()
	// Reuse the executor package's fake CLI (cwd is internal/api).
	data, err := os.ReadFile("../executor/testdata/fake-cli.sh")
	if err != nil {
		t.Fatalf("read fake cli: %v", err)
	}
	bin := filepath.Join(dir, "fake-cli.sh")
	if err := os.WriteFile(bin, data, 0o755); err != nil {
		t.Fatalf("write fake cli: %v", err)
	}
	cfg := filepath.Join(dir, "devnet.json")
	// fMint must resolve to a series name for --series.
	if err := os.WriteFile(cfg, []byte(fmt.Sprintf(`{"series":{"QPNb1":{"mint":"%s"}}}`, fMint)), 0o644); err != nil {
		t.Fatalf("write cfg: %v", err)
	}
	st, err := store.Open(t.Context(), filepath.Join(dir, "api.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(5, time.Minute)}
	h := New(slog.New(slog.DiscardHandler), st, Deps{
		Read:     fc,
		Executor: executor.New(bin, cfg, nil),
		Auth:     svc,
	})
	tok := registrarToken(t, st, svc)
	// Every request runs as a signed-in registrar unless the test sets its own Authorization header.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "" {
			r.Header.Set("Authorization", "Bearer "+tok)
		}
		h.ServeHTTP(w, r)
	}))
	t.Cleanup(srv.Close)
	log := filepath.Join(dir, "cli.log")
	t.Setenv("FAKE_CLI_LOG", log)
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, dir, "ok.json", `{"ok":true,"signature":"sig-advance","slot":"42"}`))
	return srv, st, log
}

func writeT(t *testing.T, dir, name, content string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return p
}

// postAdvance returns the status code and decoded body.
func postAdvance(t *testing.T, url string, body string) (int, map[string]any) {
	t.Helper()
	resp, err := http.Post(url+"/actions/"+fAction.String()+"/advance", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("post advance: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return resp.StatusCode, out
}

func TestAdvanceLifecycle(t *testing.T) {
	fc := &fakeChain{action: &chain.CorporateAction{
		Series: fSeries, Kind: 0, Status: 0, CashMint: fCash, Index: 0,
	}}
	srv, st, log := advanceServer(t, fc)

	type want struct {
		code  int
		step  string // "" → expect an error body
		errIn string
		noSig bool // the CLI skipped: no signature in the response
	}
	// One POST per advance; move the fake chain between calls like devnet would.
	steps := []struct {
		body   string
		want   want
		mutate func(*chain.CorporateAction)
	}{
		{body: `{"confirm":true}`, want: want{200, "strike_record", "", false}, mutate: func(a *chain.CorporateAction) { a.Status = 1 }},
		{body: `{"confirm":true}`, want: want{200, "snapshot_batch", "", false}, mutate: func(a *chain.CorporateAction) { a.HoldersSnapshotted = 1; a.UnitsSnapshotted = 100 }},
		{body: `{"confirm":true}`, want: want{200, "finalize_snapshot", "", false}, mutate: func(a *chain.CorporateAction) { a.Status = 2 }},
		{body: `{"confirm":true}`, want: want{400, "", "autofund", false}, mutate: nil},
		{body: `{"confirm":true,"autofund":true}`, want: want{200, "fund_action", "", false}, mutate: func(a *chain.CorporateAction) { a.Status = 3 }},
		{body: `{"confirm":true}`, want: want{200, "pay_batch", "", false}, mutate: func(a *chain.CorporateAction) { a.Status = 4; a.HoldersPaid = 1 }},
		{body: `{"confirm":true}`, want: want{200, "complete_action", "", false}, mutate: func(a *chain.CorporateAction) {
			a.Status = 5
			// the escrow follow-up already swept; the next advance re-sweeps → the CLI reports the skip
			if err := os.WriteFile(os.Getenv("FAKE_CLI_STDOUT"), []byte(`{"ok":true,"skipped":"already swept"}`), 0o644); err != nil {
				t.Fatalf("rewrite stdout: %v", err)
			}
		}},
		{body: `{"confirm":true}`, want: want{200, "sweep_escrow", "", true}, mutate: nil}, // completed → sweep (task 1414)
	}
	for i, s := range steps {
		code, body := postAdvance(t, srv.URL, s.body)
		if code != s.want.code {
			t.Fatalf("step %d: status = %d, want %d (body %v)", i, code, s.want.code, body)
		}
		if s.want.step != "" {
			if body["step"] != s.want.step || body["ok"] != true {
				t.Fatalf("step %d: body = %v, want step %q ok", i, body, s.want.step)
			}
			if s.want.noSig && body["signature"] != nil {
				t.Fatalf("step %d: signature = %v, want none (skipped)", i, body["signature"])
			} else if !s.want.noSig && body["signature"] != "sig-advance" {
				t.Fatalf("step %d: signature = %v, want sig-advance", i, body["signature"])
			}
		} else if !strings.Contains(fmt.Sprint(body["error"]), s.want.errIn) {
			t.Fatalf("step %d: error = %v, want it to contain %q", i, body["error"], s.want.errIn)
		}
		if s.mutate != nil {
			s.mutate(fc.action)
		}
	}

	// The CLI got the right argv for every executed step.
	raw, err := os.ReadFile(log)
	if err != nil {
		t.Fatalf("read cli log: %v", err)
	}
	got := strings.Split(strings.TrimSpace(string(raw)), "\n")
	wantArgs := []string{
		"--json action:strike --series QPNb1 --index 0",
		"--json action:snapshot --series QPNb1 --index 0",
		"--json action:finalize-snapshot --series QPNb1 --index 0",
		"--json action:fund --series QPNb1 --index 0",
		"--json action:pay --series QPNb1 --index 0",
		"--json action:complete --series QPNb1 --index 0",
		"--json action:sweep --series QPNb1 --index 0", // escrow follow-up after complete (task 1414)
		"--json action:sweep --series QPNb1 --index 0", // completed action → sweep step
	}
	if strings.Join(got, "\n") != strings.Join(wantArgs, "\n") {
		t.Fatalf("cli log = %q, want %q", got, wantArgs)
	}

	// Every executed step landed in the activity feed.
	events, err := st.ListActivity(t.Context(), 100)
	if err != nil {
		t.Fatalf("list activity: %v", err)
	}
	if len(events) != len(wantArgs) {
		t.Fatalf("activity rows = %d, want %d", len(events), len(wantArgs))
	}
	if events[0].Kind != "advance:strike_record" || events[0].Sig != "sig-advance" {
		t.Fatalf("first activity = %s/%s, want advance:strike_record/sig-advance", events[0].Kind, events[0].Sig)
	}
	// the escrow follow-up after complete (task 1414): one CLI run, one audit row
	if events[6].Kind != "advance:"+executor.StepSweep || events[6].Sig != "sig-advance" || events[6].ActionPDA == nil {
		t.Fatalf("follow-up row = %+v, want advance:%s/sig-advance with the action pda", events[6], executor.StepSweep)
	}
}

func TestAdvanceCliErrorIs409(t *testing.T) {
	fc := &fakeChain{action: &chain.CorporateAction{Series: fSeries, Status: 0}}
	dir := t.TempDir()
	t.Setenv("FAKE_CLI_EXIT", "1")
	t.Setenv("FAKE_CLI_STDERR", writeT(t, dir, "err.txt", "qupon: TooEarly: record date not reached\n"))
	srv, _, _ := advanceServer(t, fc)

	code, body := postAdvance(t, srv.URL, `{"confirm":true}`)
	if code != http.StatusConflict {
		t.Fatalf("status = %d, want 409 (body %v)", code, body)
	}
	if !strings.Contains(fmt.Sprint(body["error"]), "TooEarly") {
		t.Fatalf("error = %v, want the CLI message", body["error"])
	}
}

// TestAdvanceCliFailureRecordsPartialBatches (task 1408): a failed batch step
// exits 1 with the completed batches in stdout JSON — the API records those
// signatures in the activity feed before surfacing the 409, or money-moving
// transactions vanish from the audit trail.
func TestAdvanceCliFailureRecordsPartialBatches(t *testing.T) {
	fc := &fakeChain{action: &chain.CorporateAction{Series: fSeries, Status: 3}} // Funded → pay_batch
	srv, st, _ := advanceServer(t, fc)                                           // sets FAKE_CLI_STDOUT itself — override after
	t.Setenv("FAKE_CLI_EXIT", "1")
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, t.TempDir(), "partial.json",
		`{"ok":false,"error":"batch 2/2 failed","results":[{"signature":"pay1","slot":"10","holders":8},{"signature":"pay2","slot":"11","holders":2}]}`))

	code, body := postAdvance(t, srv.URL, `{"confirm":true}`)
	if code != http.StatusConflict {
		t.Fatalf("status = %d, want 409 (body %v)", code, body)
	}
	if !strings.Contains(fmt.Sprint(body["error"]), "batch 2/2 failed") {
		t.Fatalf("error = %v, want the CLI message", body["error"])
	}
	events, err := st.ListActivity(t.Context(), 10)
	if err != nil || len(events) != 2 {
		t.Fatalf("activity rows = %d (%v), want one per completed batch", len(events), err)
	}
	// ListActivity is oldest first: pay1@10 then pay2@11, both advance:pay_batch.
	for i, want := range []string{"pay1", "pay2"} {
		if events[i].Kind != "advance:"+executor.StepPay || events[i].Sig != want {
			t.Fatalf("row %d = %s/%s, want advance:pay_batch/%s", i, events[i].Kind, events[i].Sig, want)
		}
	}
	if events[1].Slot != 11 {
		t.Fatalf("slot = %d, want 11", events[1].Slot)
	}
}

func TestAdvanceValidation(t *testing.T) {
	fc := &fakeChain{action: &chain.CorporateAction{Series: fSeries, Status: 0}}
	srv, _, _ := advanceServer(t, fc)

	// confirm missing/false → 400, nothing executed.
	if code, _ := postAdvance(t, srv.URL, `{"confirm":false}`); code != http.StatusBadRequest {
		t.Fatalf("confirm=false status = %d, want 400", code)
	}
	// unknown action → 404
	resp, err := http.Post(srv.URL+"/actions/"+solana.PublicKey{9: 9}.String()+"/advance",
		"application/json", bytes.NewReader([]byte(`{"confirm":true}`)))
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown action status = %d, want 404", resp.StatusCode)
	}
	// bad pda → 400
	if code, _ := postAdvance(t, srv.URL, `{"confirm":true}`); code == 0 {
		t.Fatal("unreachable")
	}
	resp2, err := http.Post(srv.URL+"/actions/notabase58/advance", "application/json", strings.NewReader(`{"confirm":true}`))
	if err != nil {
		t.Fatalf("post bad pda: %v", err)
	}
	_ = resp2.Body.Close()
	if resp2.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad pda status = %d, want 400", resp2.StatusCode)
	}
	// nil executor → 503
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "v.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	srv2 := httptest.NewServer(New(slog.New(slog.DiscardHandler), st, Deps{}))
	t.Cleanup(srv2.Close)
	resp3, err := http.Post(srv2.URL+"/actions/"+fAction.String()+"/advance", "application/json", strings.NewReader(`{"confirm":true}`))
	if err != nil {
		t.Fatalf("post nil exec: %v", err)
	}
	_ = resp3.Body.Close()
	if resp3.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("nil executor status = %d, want 503", resp3.StatusCode)
	}
}

func registrarToken(t *testing.T, st *store.Store, svc *auth.Service) string {
	t.Helper()
	hash, _ := auth.HashPassword("pw-registrar")
	if _, err := st.UpsertUser(t.Context(), store.User{Email: "op@test.kz", Name: "op", Role: "registrar"}, hash); err != nil {
		t.Fatal(err)
	}
	tok, _, err := svc.Login(t.Context(), "op@test.kz", "pw-registrar")
	if err != nil {
		t.Fatal(err)
	}
	return tok
}
