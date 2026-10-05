package api

// POST /registrar/investors, /registrar/investors/{mint}/{owner}/suspend|reinstate
// and GET /registrar/audit against the fake CLI: onboarding must run
// kyc:attest then investor:register (argv asserted in order), a failing
// attestation stops before register (409, one CLI line), malformed input is
// 400 before any CLI run, and the audit feed lists writes newest first.

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
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// registrarServer mirrors advanceServer with an onboarding canned stdout and
// an extra issuer token (the default header stays the registrar's).
func registrarServer(t *testing.T) (*httptest.Server, *store.Store, string, string) {
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
	st, err := store.Open(t.Context(), filepath.Join(dir, "api.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(5, time.Minute)}
	h := New(slog.New(slog.DiscardHandler), st, Deps{Executor: executor.New(bin, cfg, nil), Auth: svc})
	tok := registrarToken(t, st, svc)
	issuerTok := roleToken(t, st, svc, "issuer")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "" {
			r.Header.Set("Authorization", "Bearer "+tok)
		}
		h.ServeHTTP(w, r)
	}))
	t.Cleanup(srv.Close)
	log := filepath.Join(dir, "cli.log")
	t.Setenv("FAKE_CLI_LOG", log)
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, dir, "ok.json", `{"ok":true,"signature":"sig-ob","slot":"7","investor":"inv-pda","attestation":"att-pda"}`))
	return srv, st, log, issuerTok
}

// roleToken signs a user of the given role in directly through the service.
func roleToken(t *testing.T, st *store.Store, svc *auth.Service, role string) string {
	t.Helper()
	hash, err := auth.HashPassword("pw-" + role)
	if err != nil {
		t.Fatal(err)
	}
	email := role + "@test.kz"
	if _, err := st.UpsertUser(t.Context(), store.User{Email: email, Name: role, Role: role}, hash); err != nil {
		t.Fatal(err)
	}
	tok, _, err := svc.Login(t.Context(), email, "pw-"+role)
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func cliLines(t *testing.T, log string) []string {
	t.Helper()
	raw, err := os.ReadFile(log)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		t.Fatalf("read cli log: %v", err)
	}
	return strings.Split(strings.TrimSpace(string(raw)), "\n")
}

func postJSON(t *testing.T, url, path, body, token string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, url+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func TestRegistrarOnboard(t *testing.T) {
	srv, st, log, _ := registrarServer(t)
	body := `{"series":"` + fMint.String() + `","owner":"` + fOwnerA.String() + `","investorType":"legal_entity","residency":"nonresident","taxBps":1200,"expiryDays":30}`

	code, out := postJSON(t, srv.URL, "/registrar/investors", body, "")
	if code != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (body %v)", code, out)
	}
	if out["investor"] != "inv-pda" || out["attestation"] != "att-pda" {
		t.Fatalf("body = %v, want investor inv-pda and attestation att-pda", out)
	}
	sigs, _ := out["signatures"].([]any)
	if len(sigs) != 2 {
		t.Fatalf("signatures = %v, want the attest and register signatures", out["signatures"])
	}

	want := []string{
		"--json kyc:attest --owner " + fOwnerA.String() + " --type legal_entity --residency nonresident --tax-bps 1200 --expiry-days 30",
		"--json investor:register --series QPNb1 --owner " + fOwnerA.String() + " --type legal_entity --residency nonresident --tax-bps 1200",
	}
	if got := cliLines(t, log); strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("cli log = %q, want %q", got, want)
	}

	rows, err := st.ListAudit(t.Context(), 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Route != "POST /registrar/investors" || !rows[0].OK || len(rows[0].Signatures) != 2 {
		t.Fatalf("audit rows = %+v, want one ok onboarding row with two signatures", rows)
	}
}

func TestRegistrarOnboardAttestFailureStops(t *testing.T) {
	srv, _, log, _ := registrarServer(t)
	dir := t.TempDir()
	t.Setenv("FAKE_CLI_EXIT", "1")
	t.Setenv("FAKE_CLI_STDERR", writeT(t, dir, "err.txt", "qupon: KycMismatch: attested attributes differ\n"))

	code, out := postJSON(t, srv.URL, "/registrar/investors",
		`{"series":"`+fMint.String()+`","owner":"`+fOwnerA.String()+`","investorType":"individual","residency":"resident","taxBps":0}`, "")
	if code != http.StatusConflict {
		t.Fatalf("status = %d, want 409 (body %v)", code, out)
	}
	if out["code"] != "onchain" || !strings.Contains(fmt.Sprint(out["onchainError"]), "KycMismatch") {
		t.Fatalf("body = %v, want code onchain with the CLI message in onchainError", out)
	}
	// The register step never ran.
	if got := cliLines(t, log); len(got) != 1 || !strings.HasPrefix(got[0], "--json kyc:attest ") {
		t.Fatalf("cli log = %q, want exactly one kyc:attest line", got)
	}
}

func TestRegistrarOnboardValidation(t *testing.T) {
	srv, _, log, _ := registrarServer(t)
	okOwner := fOwnerA.String()
	for _, tc := range []struct {
		name string
		body string
		code int
	}{
		{"tax bps over 10000", `{"series":"` + fMint.String() + `","owner":"` + okOwner + `","investorType":"individual","residency":"resident","taxBps":10001}`, http.StatusBadRequest},
		{"owner not base58", `{"series":"` + fMint.String() + `","owner":"not-base58","investorType":"individual","residency":"resident","taxBps":0}`, http.StatusBadRequest},
		{"series not base58", `{"series":"nope","owner":"` + okOwner + `","investorType":"individual","residency":"resident","taxBps":0}`, http.StatusBadRequest},
		{"unknown investor type", `{"series":"` + fMint.String() + `","owner":"` + okOwner + `","investorType":"corp","residency":"resident","taxBps":0}`, http.StatusBadRequest},
		{"unknown residency", `{"series":"` + fMint.String() + `","owner":"` + okOwner + `","investorType":"individual","residency":"alien","taxBps":0}`, http.StatusBadRequest},
		{"negative expiry", `{"series":"` + fMint.String() + `","owner":"` + okOwner + `","investorType":"individual","residency":"resident","taxBps":0,"expiryDays":-1}`, http.StatusBadRequest},
		{"unknown series mint", `{"series":"` + fAction.String() + `","owner":"` + okOwner + `","investorType":"individual","residency":"resident","taxBps":0}`, http.StatusNotFound},
	} {
		code, _ := postJSON(t, srv.URL, "/registrar/investors", tc.body, "")
		if code != tc.code {
			t.Errorf("%s: status = %d, want %d", tc.name, code, tc.code)
		}
	}
	if got := cliLines(t, log); len(got) != 0 {
		t.Fatalf("cli log = %q, want no CLI run on rejected input", got)
	}
}

func TestRegistrarSuspendReinstate(t *testing.T) {
	srv, _, log, _ := registrarServer(t)
	for _, verb := range []string{"suspend", "reinstate"} {
		code, out := postJSON(t, srv.URL, "/registrar/investors/"+fMint.String()+"/"+fOwnerA.String()+"/"+verb, "", "")
		if code != http.StatusOK {
			t.Fatalf("%s: status = %d, want 200 (body %v)", verb, code, out)
		}
		if sigs, _ := out["signatures"].([]any); len(sigs) != 1 {
			t.Fatalf("%s: signatures = %v, want one", verb, out["signatures"])
		}
	}
	want := "--json investor:suspend --series QPNb1 --owner " + fOwnerA.String() + "\n" +
		"--json investor:reinstate --series QPNb1 --owner " + fOwnerA.String()
	if got := strings.Join(cliLines(t, log), "\n"); got != want {
		t.Fatalf("cli log = %q, want %q", got, want)
	}
	// Unknown mint → 404 before any CLI run for that request.
	before := len(cliLines(t, log))
	if code, _ := postJSON(t, srv.URL, "/registrar/investors/"+fAction.String()+"/"+fOwnerA.String()+"/suspend", "", ""); code != http.StatusNotFound {
		t.Fatalf("unknown mint suspend = %d, want 404", code)
	}
	if got := cliLines(t, log); len(got) != before {
		t.Fatalf("cli log grew to %d lines, want %d", len(got), before)
	}
}

func TestRegistrarAuditFeed(t *testing.T) {
	srv, _, _, _ := registrarServer(t)
	if code, _ := postJSON(t, srv.URL, "/registrar/investors/"+fMint.String()+"/"+fOwnerA.String()+"/suspend", "", ""); code != http.StatusOK {
		t.Fatalf("seed suspend = %d, want 200", code)
	}
	if code, _ := postJSON(t, srv.URL, "/registrar/investors",
		`{"series":"`+fMint.String()+`","owner":"`+fOwnerA.String()+`","investorType":"individual","residency":"resident","taxBps":0}`, ""); code != http.StatusCreated {
		t.Fatalf("seed onboard = %d, want 201", code)
	}

	resp, err := http.Get(srv.URL + "/registrar/audit")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	var out struct {
		Items []struct {
			Route string `json:"route"`
			OK    bool   `json:"ok"`
		} `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK || len(out.Items) != 2 {
		t.Fatalf("audit feed = %d %+v, want the two writes", resp.StatusCode, out.Items)
	}
	// Newest first: onboarding ran last.
	if out.Items[0].Route != "POST /registrar/investors" || out.Items[1].Route != "POST /registrar/investors/"+fMint.String()+"/"+fOwnerA.String()+"/suspend" {
		t.Fatalf("audit order = %+v, want newest first", out.Items)
	}

	// limit works; bad limit is 400.
	resp2, err := http.Get(srv.URL + "/registrar/audit?limit=1")
	if err != nil {
		t.Fatal(err)
	}
	_ = resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("limit=1 status = %d", resp2.StatusCode)
	}
	resp3, err := http.Get(srv.URL + "/registrar/audit?limit=0")
	if err != nil {
		t.Fatal(err)
	}
	_ = resp3.Body.Close()
	if resp3.StatusCode != http.StatusBadRequest {
		t.Fatalf("limit=0 status = %d, want 400", resp3.StatusCode)
	}
}

func TestRegistrarOnboardIssuerForbidden(t *testing.T) {
	srv, _, log, issuer := registrarServer(t)
	if code, _ := postJSON(t, srv.URL, "/registrar/investors",
		`{"series":"`+fMint.String()+`","owner":"`+fOwnerA.String()+`","investorType":"individual","residency":"resident","taxBps":0}`, issuer); code != http.StatusForbidden {
		t.Fatalf("issuer onboarding = %d, want 403", code)
	}
	if got := cliLines(t, log); len(got) != 0 {
		t.Fatalf("cli log = %q, want no CLI run without the registrar role", got)
	}
}
