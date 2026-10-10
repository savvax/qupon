package api

// The judge sandbox endpoints (task 1524) over HTTP with the fake CLI: create sets the cookie and replays
// the chain view, the throttle keys on the LAST X-Forwarded-For entry, GET answers 404 for unknown ids,
// the dvp scenario's money fields decode as Amount objects, and /series hides sandboxes unless the caller
// owns them.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/sandbox"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// sandboxServer wires the API with the fake CLI, the fake chain and a sandbox.Service whose three custodial
// demo investors sign with temp keypairs.
func sandboxServer(t *testing.T) (*httptest.Server, *store.Store, *sandbox.Service) {
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
	base, exec := filepath.Join(dir, "base.json"), filepath.Join(dir, "exec.json")
	cfg := `{"series":{}}`
	if err := os.WriteFile(base, []byte(cfg), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(exec, []byte(cfg), 0o644); err != nil {
		t.Fatal(err)
	}
	st, err := store.Open(t.Context(), filepath.Join(dir, "api.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	t.Setenv("FAKE_CLI_LOG", filepath.Join(dir, "cli.log"))
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, dir, "ok.json",
		fmt.Sprintf(`{"ok":true,"signature":"sig1","slot":"7","mint":"%s"}`, fMint)))

	holders := make([]sandbox.Holder, 3)
	for i, label := range []string{"Altyn Capital", "Dana K.", "Nomad Pension"} {
		sk := make([]int, 64)
		for j := range sk {
			sk[j] = j + i + 1
		}
		p := filepath.Join(dir, fmt.Sprintf("h%d.json", i+1))
		if err := os.WriteFile(p, mustMarshal(t, sk), 0o600); err != nil {
			t.Fatal(err)
		}
		holders[i] = sandbox.Holder{Keypair: p, Label: label, Units: uint64(10 * (i + 1)), Faucet: 100}
	}
	holders[2].Bank, holders[2].TaxBps = true, 1500

	svc := &sandbox.Service{
		Exec: executor.New(bin, exec, nil), Store: st, BaseConfig: base, Holders: holders,
		Outsider: filepath.Join(dir, "h1.json"),
	}
	fc := &fakeChain{action: (&fakeRead{}).action()}
	h := New(slog.New(slog.DiscardHandler), st, Deps{Read: listingChain{fc}, Executor: svc.Exec, BaseConfig: base, Sandbox: svc})
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return srv, st, svc
}

// listingChain makes the advance-test fakeChain list its series (AllSeries is nil there, and the /series
// filter test needs one row).
type listingChain struct{ *fakeChain }

func (listingChain) AllSeries(context.Context) ([]chain.SeriesRecord, error) {
	return []chain.SeriesRecord{{PDA: fSeries, Series: (&fakeRead{}).series()}}, nil
}

func mustMarshal(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func postSandbox(t *testing.T, url, path, body, xff string) (*http.Response, map[string]any) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, url+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if xff != "" {
		req.Header.Set("X-Forwarded-For", xff)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	return res, out
}

// TestSandboxCreateAndCookie: a happy create answers 201 with the SBX ticker and the qupon_sandbox cookie.
func TestSandboxCreateAndCookie(t *testing.T) {
	srv, st, _ := sandboxServer(t)
	res, out := postSandbox(t, srv.URL, "/demo/sandbox", `{"requestId":"r1"}`, "9.9.9.9")
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create: %d %v", res.StatusCode, out)
	}
	if !strings.HasPrefix(fmt.Sprint(out["ticker"]), "SBX-") || out["mint"] != fMint.String() {
		t.Fatalf("created = %v", out)
	}
	var cookie *http.Cookie
	for _, c := range res.Cookies() {
		if c.Name == SandboxCookie {
			cookie = c
		}
	}
	if cookie == nil || cookie.Value == "" || !cookie.HttpOnly || cookie.MaxAge != 24*3600 {
		t.Fatalf("cookie = %+v", cookie)
	}
	x, err := st.SandboxByID(t.Context(), cookie.Value)
	if err != nil || x == nil {
		t.Fatalf("sandbox by cookie %q: %v %v", cookie.Value, x, err)
	}

	// GET by the returned id serves the page's poll; an unknown id is 404 sandbox_not_found.
	get := doGetURL(t, srv.URL, "/demo/sandbox/"+cookie.Value)
	if get.StatusCode != http.StatusOK || !strings.Contains(get.Body, `"id":"`+cookie.Value+`"`) {
		t.Fatalf("get: %d %s", get.StatusCode, get.Body)
	}
	if get := doGetURL(t, srv.URL, "/demo/sandbox/nope"); get.StatusCode != 404 || !strings.Contains(get.Body, "sandbox_not_found") {
		t.Fatalf("unknown id: %d %s", get.StatusCode, get.Body)
	}

	// A bad wallet is 400 bad_wallet; a doubled requestId returns the same sandbox.
	if res, out := postSandbox(t, srv.URL, "/demo/sandbox", `{"wallet":"zz"}`, "9.9.9.9"); res.StatusCode != 400 || out["code"] != "bad_wallet" {
		t.Fatalf("bad wallet: %d %v", res.StatusCode, out)
	}
	res2, out2 := postSandbox(t, srv.URL, "/demo/sandbox", `{"requestId":"r1"}`, "9.9.9.9")
	if res2.StatusCode != http.StatusCreated || out2["id"] != out["id"] {
		t.Fatalf("idempotent create: %d %v", res2.StatusCode, out2)
	}
}

// TestSandboxRateLimitUsesLastForwardedFor: the limit keys on the XFF entry Caddy appends (the last), never
// the first — the visitor controls that one.
func TestSandboxRateLimitUsesLastForwardedFor(t *testing.T) {
	srv, st, _ := sandboxServer(t)
	// Three sandboxes already created by 5.6.7.8 (the last hop)…
	for i := range 3 {
		x := store.Sandbox{ID: fmt.Sprintf("seed%d", i), Ticker: "SBX-SEED0", Mint: fMint.String(),
			IP: "5.6.7.8", CreatedAt: time.Now().Unix(), ExpiresAt: time.Now().Add(time.Hour).Unix()}
		if err := st.InsertSandbox(t.Context(), x); err != nil {
			t.Fatal(err)
		}
	}
	// …so a visitor whose spoofed first hop is 1.2.3.4 but whose real hop is 5.6.7.8 is throttled…
	res, out := postSandbox(t, srv.URL, "/demo/sandbox", `{"wallet":"zz"}`, "1.2.3.4, 5.6.7.8")
	if res.StatusCode != http.StatusTooManyRequests || out["code"] != "demo_throttled" {
		t.Fatalf("throttled on the last hop: %d %v", res.StatusCode, out)
	}
	// …while the same spoofed first hop with an untouched last hop is not.
	res, out = postSandbox(t, srv.URL, "/demo/sandbox", `{"wallet":"9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"}`, "1.2.3.4, 8.8.4.4")
	if res.StatusCode == http.StatusTooManyRequests {
		t.Fatalf("throttled on the first (forged) hop: %d %v", res.StatusCode, out)
	}
}

// TestSandboxScenarioHTTP: the dvp_trade POST answers with Amount objects (the web reads trade.cash.minor).
func TestSandboxScenarioHTTP(t *testing.T) {
	srv, st, svc := sandboxServer(t)
	res, out := postSandbox(t, srv.URL, "/demo/sandbox", `{"requestId":"dvp1"}`, "7.7.7.7")
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create: %d %v", res.StatusCode, out)
	}
	id := fmt.Sprint(out["id"])
	x, _ := st.SandboxByID(t.Context(), id)
	// The scenario reads the series through the service's Reader: point it at the fake chain.
	svc.Read = listingChain{&fakeChain{}}

	trade := `{"ok":true,"signature":"sigT","slot":"9","swapDvp":"Swap11111111111111111111111111111111111111111",
		"units":"5","clean":"500000","accrued":"2083","accruedDays":"15","cashAmount":"502083"}`
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, t.TempDir(), "trade.json", trade))
	res, out = postSandbox(t, srv.URL, "/demo/sandbox/"+id+"/scenario", `{"kind":"dvp_trade"}`, "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("dvp_trade: %d %v", res.StatusCode, out)
	}
	tr, ok := out["trade"].(map[string]any)
	if !ok {
		t.Fatalf("no trade in %v", out)
	}
	cash, ok := tr["cash"].(map[string]any)
	if !ok || cash["minor"] != "502083" || cash["currency"] == "" {
		t.Fatalf("trade.cash = %v, want an Amount object with minor 502083", tr["cash"])
	}
	// The stored detail replays in GET's scenarios[].
	get := doGetURL(t, srv.URL, "/demo/sandbox/"+id)
	if !strings.Contains(get.Body, `"kind":"dvp_trade"`) || !strings.Contains(get.Body, `"minor":"502083"`) {
		t.Fatalf("get scenarios missing the stored dvp_trade: %s", get.Body)
	}
	if x == nil {
		t.Fatal("sandbox row vanished")
	}

	// skip_funding twice is 409 scenario_unavailable.
	res, out = postSandbox(t, srv.URL, "/demo/sandbox/"+id+"/scenario", `{"kind":"skip_funding"}`, "")
	if res.StatusCode != http.StatusOK {
		t.Fatalf("skip_funding: %d %v", res.StatusCode, out)
	}
	res, out = postSandbox(t, srv.URL, "/demo/sandbox/"+id+"/scenario", `{"kind":"skip_funding"}`, "")
	if res.StatusCode != http.StatusConflict || out["code"] != "scenario_unavailable" {
		t.Fatalf("second skip_funding: %d %v", res.StatusCode, out)
	}
}

// TestSandboxOffWithoutService: a nil Deps.Sandbox answers 503 sandbox_off on all three routes.
func TestSandboxOffWithoutService(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(t.Context(), filepath.Join(dir, "api.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	h := New(slog.New(slog.DiscardHandler), st, Deps{})
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	for _, path := range []string{"/demo/sandbox", "/demo/sandbox/x", "/demo/sandbox/x/scenario"} {
		method := http.MethodGet
		if !strings.HasSuffix(path, "/x") {
			method = http.MethodPost
		}
		req, _ := http.NewRequest(method, srv.URL+path, strings.NewReader(`{}`))
		res, err := http.DefaultClient.Do(req)
		if err != nil || res.StatusCode != http.StatusServiceUnavailable {
			t.Errorf("%s %s: %v %d, want 503", method, path, err, res.StatusCode)
		}
		_ = res.Body.Close()
	}
}

// TestSeriesHidesSandboxesButNotTheOwners: /series filters sandboxes by the qupon_sandbox cookie.
func TestSeriesHidesSandboxesButNotTheOwners(t *testing.T) {
	srv, st, _ := sandboxServer(t)
	if err := st.SetSeriesSandbox(t.Context(), fMint.String(), "sbx-mine"); err != nil {
		t.Fatal(err)
	}
	plain := doGetURL(t, srv.URL, "/series")
	if strings.Contains(plain.Body, fMint.String()) || plain.StatusCode != 200 {
		t.Fatalf("public /series leaks the sandbox: %d %s", plain.StatusCode, plain.Body)
	}
	req, _ := http.NewRequest(http.MethodGet, srv.URL+"/series", nil)
	req.AddCookie(&http.Cookie{Name: SandboxCookie, Value: "sbx-mine"})
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	b, _ := io.ReadAll(res.Body)
	if !strings.Contains(string(b), fMint.String()) {
		t.Fatalf("owner's /series hides their own sandbox: %s", string(b))
	}
}

func doGetURL(t *testing.T, url, path string) struct {
	StatusCode int
	Body       string
} {
	t.Helper()
	res, err := http.Get(url + path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	b, _ := io.ReadAll(res.Body)
	return struct {
		StatusCode int
		Body       string
	}{res.StatusCode, string(b)}
}
