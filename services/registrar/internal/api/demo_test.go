package api

// Demo investor endpoints (product spec §4): subscribe and vote signed with
// the server-side demo investor keypair (a labelled custodial wallet for
// judges without Phantom). Role investor_demo only; every response marks
// demo:true. Same fake-CLI contract as advance_test.go.

import (
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

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// demoServer builds the API with the fake chain + fake CLI and returns tokens
// for an investor_demo and a registrar user.
func demoServer(t *testing.T, fc *fakeChain) (url string, st *store.Store, log, demoTok, regTok string) {
	t.Helper()
	dir := t.TempDir()
	data, err := os.ReadFile("../executor/testdata/fake-cli.sh")
	if err != nil {
		t.Fatalf("read fake cli: %v", err)
	}
	bin := filepath.Join(dir, "fake-cli.sh")
	if err := os.WriteFile(bin, data, 0o755); err != nil {
		t.Fatalf("write fake cli: %v", err)
	}
	cfg := filepath.Join(dir, "devnet.json")
	if err := os.WriteFile(cfg, []byte(fmt.Sprintf(`{"series":{"QPNb1":{"mint":"%s"}}}`, fMint)), 0o644); err != nil {
		t.Fatalf("write cfg: %v", err)
	}
	st, err = store.Open(t.Context(), filepath.Join(dir, "demo.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(5, time.Minute)}
	h := New(slog.New(slog.DiscardHandler), st, Deps{Read: fc, Executor: executor.New(bin, cfg, nil), Auth: svc})
	login := func(email, role, pw string) string {
		hash, _ := auth.HashPassword(pw)
		if _, err := st.UpsertUser(t.Context(), store.User{Email: email, Name: role, Role: role, IsDemo: role == "investor_demo"}, hash); err != nil {
			t.Fatal(err)
		}
		tok, _, err := svc.Login(t.Context(), email, pw)
		if err != nil {
			t.Fatal(err)
		}
		return tok
	}
	demoTok = login("demo-investor@qupon.demo", "investor_demo", "pw-demo")
	regTok = login("op@test.kz", "registrar", "pw-reg")
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	log = filepath.Join(dir, "cli.log")
	t.Setenv("FAKE_CLI_LOG", log)
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, dir, "ok.json", `{"ok":true,"signature":"sig-demo","slot":"7"}`))
	return srv.URL, st, log, demoTok, regTok
}

func postDemo(t *testing.T, url, path, body, token string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, url+path, strings.NewReader(body))
	if err != nil {
		t.Fatalf("new request %s: %v", path, err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("post %s: %v", path, err)
	}
	defer func() { _ = resp.Body.Close() }()
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode %s: %v", path, err)
	}
	return resp.StatusCode, out
}

func cliLog(t *testing.T, path string) []string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read cli log: %v", err)
	}
	return strings.Split(strings.TrimSpace(string(raw)), "\n")
}

func TestDemoSubscribe(t *testing.T) {
	fc := &fakeChain{action: &chain.CorporateAction{Series: fSeries, Index: 1}}
	url, st, log, demo, reg := demoServer(t, fc)

	code, body := postDemo(t, url, "/demo/investor/subscribe", fmt.Sprintf(`{"series":"%s","units":25}`, fMint), demo)
	if code != http.StatusOK || body["demo"] != true || body["ok"] != true || body["signature"] != "sig-demo" {
		t.Fatalf("subscribe = %d %v, want 200 demo:true", code, body)
	}
	if got := cliLog(t, log); len(got) != 1 || got[0] != "--json subscribe --series QPNb1 --units 25" {
		t.Fatalf("cli log = %q, want subscribe argv", got)
	}

	// units 0 → 400, nothing executed
	if code, _ := postDemo(t, url, "/demo/investor/subscribe", `{"series":"`+fMint.String()+`","units":0}`, demo); code != http.StatusBadRequest {
		t.Fatalf("units 0 = %d, want 400", code)
	}
	// unknown mint → 404 before any CLI run
	if code, _ := postDemo(t, url, "/demo/investor/subscribe", `{"series":"11111111111111111111111111111111","units":5}`, demo); code != http.StatusNotFound {
		t.Fatalf("unknown series = %d, want 404", code)
	}
	// wrong role → 403, no CLI run
	if code, _ := postDemo(t, url, "/demo/investor/subscribe", `{"series":"`+fMint.String()+`","units":5}`, reg); code != http.StatusForbidden {
		t.Fatalf("registrar token = %d, want 403", code)
	}
	if got := cliLog(t, log); len(got) != 1 {
		t.Fatalf("cli log after rejected calls = %q, want only the first run", got)
	}

	rows, err := st.ListAudit(t.Context(), 10)
	if err != nil || len(rows) != 1 || rows[0].Route != "POST /demo/investor/subscribe" || !rows[0].OK || rows[0].Signatures[0] != "sig-demo" {
		t.Fatalf("audit = %+v %v, want one ok subscribe row", rows, err)
	}
}

func TestDemoVote(t *testing.T) {
	fc := &fakeChain{action: &chain.CorporateAction{Series: fSeries, Index: 1, Kind: 4, Status: 8}}
	url, st, log, demo, reg := demoServer(t, fc)

	code, body := postDemo(t, url, "/demo/investor/vote", fmt.Sprintf(`{"action":"%s","choice":"for"}`, fAction), demo)
	if code != http.StatusOK || body["demo"] != true || body["signature"] != "sig-demo" {
		t.Fatalf("vote = %d %v, want 200 demo:true", code, body)
	}
	if got := cliLog(t, log); len(got) != 1 || got[0] != "--json vote --series QPNb1 --index 1 --choice for" {
		t.Fatalf("cli log = %q, want vote argv", got)
	}

	for _, tc := range []struct{ body, tok string }{
		{`{"action":"` + fAction.String() + `","choice":"maybe"}`, demo}, // unknown choice → 400
		{`{"action":"notabase58","choice":"for"}`, demo},                 // bad pda → 400
		{`{"action":"` + fAction.String() + `","choice":"for"}`, reg},    // wrong role → 403
	} {
		if code, _ := postDemo(t, url, "/demo/investor/vote", tc.body, tc.tok); code != http.StatusBadRequest && code != http.StatusForbidden {
			t.Fatalf("vote %s = %d, want 400/403", tc.body, code)
		}
	}
	// unknown action → 404
	if code, _ := postDemo(t, url, "/demo/investor/vote", `{"action":"11111111111111111111111111111111","choice":"for"}`, demo); code != http.StatusNotFound {
		t.Fatalf("unknown action = %d, want 404", code)
	}
	if got := cliLog(t, log); len(got) != 1 {
		t.Fatalf("cli log after rejected votes = %q, want only the first run", got)
	}
	rows, err := st.ListAudit(t.Context(), 10)
	if err != nil || len(rows) != 1 || rows[0].Route != "POST /demo/investor/vote" || !rows[0].OK {
		t.Fatalf("audit = %+v %v, want one ok vote row", rows, err)
	}
}
