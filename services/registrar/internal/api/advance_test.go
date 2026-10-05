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

	solana "github.com/solana-foundation/solana-go/v2"

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
	return &chain.Mint{Decimals: 2}, nil
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
	h := New(slog.New(slog.DiscardHandler), st, Deps{
		Read:     fc,
		Executor: executor.New(bin, cfg, nil),
	})
	srv := httptest.NewServer(h)
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
	}
	// One POST per advance; move the fake chain between calls like devnet would.
	steps := []struct {
		body   string
		want   want
		mutate func(*chain.CorporateAction)
	}{
		{body: `{"confirm":true}`, want: want{200, "strike_record", ""}, mutate: func(a *chain.CorporateAction) { a.Status = 1 }},
		{body: `{"confirm":true}`, want: want{200, "snapshot_batch", ""}, mutate: func(a *chain.CorporateAction) { a.HoldersSnapshotted = 1 }},
		{body: `{"confirm":true}`, want: want{200, "finalize_snapshot", ""}, mutate: func(a *chain.CorporateAction) { a.Status = 2 }},
		{body: `{"confirm":true}`, want: want{400, "", "autofund"}, mutate: nil},
		{body: `{"confirm":true,"autofund":true}`, want: want{200, "fund_action", ""}, mutate: func(a *chain.CorporateAction) { a.Status = 3 }},
		{body: `{"confirm":true}`, want: want{200, "pay_batch", ""}, mutate: func(a *chain.CorporateAction) { a.Status = 4; a.HoldersPaid = 1 }},
		{body: `{"confirm":true}`, want: want{200, "complete_action", ""}, mutate: func(a *chain.CorporateAction) { a.Status = 5 }},
		{body: `{"confirm":true}`, want: want{400, "", "completed"}, mutate: nil},
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
			if body["signature"] != "sig-advance" {
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

func TestAdvanceRequiresTokenWhenSet(t *testing.T) {
	fc := &fakeChain{action: &chain.CorporateAction{Series: fSeries, Status: 0}}
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "api.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	srv := httptest.NewServer(New(slog.New(slog.DiscardHandler), st, Deps{Read: fc, AdvanceToken: "s3cret"}))
	t.Cleanup(srv.Close)
	url := srv.URL + "/actions/" + fAction.String() + "/advance"
	for _, tc := range []struct {
		auth string
		want int
	}{
		{"", http.StatusUnauthorized},
		{"Bearer wrong", http.StatusUnauthorized},
		{"Bearer s3cret", http.StatusServiceUnavailable}, // authorized; no executor configured
	} {
		req, _ := http.NewRequest(http.MethodPost, url, strings.NewReader(`{"confirm":true}`))
		if tc.auth != "" {
			req.Header.Set("Authorization", tc.auth)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("post: %v", err)
		}
		_ = resp.Body.Close()
		if resp.StatusCode != tc.want {
			t.Errorf("auth %q: status = %d, want %d", tc.auth, resp.StatusCode, tc.want)
		}
	}
}
