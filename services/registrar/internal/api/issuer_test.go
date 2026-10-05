package api

// POST /issuer/series end-to-end with the fake CLI: a valid body runs
// `series:create`, records the mint in the registry and one audit row; a
// duplicate name never reaches the CLI again; malformed input is rejected
// before any execution; a registrar session gets 403 with nothing executed.

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"encoding/json"
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

// issuerServer wires the API with the fake qupon CLI (argv logged), a base
// config for execconfig.Write, and both an issuer and a registrar session.
func issuerServer(t *testing.T) (*httptest.Server, *store.Store, string, string, string) {
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
	base := filepath.Join(dir, "base.json")
	if err := os.WriteFile(base, []byte(`{"programId":"P","series":{"QPNb1":{"mint":"M1"}}}`), 0o644); err != nil {
		t.Fatalf("write base cfg: %v", err)
	}
	st, err := store.Open(t.Context(), filepath.Join(dir, "api.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(5, time.Minute)}
	h := New(slog.New(slog.DiscardHandler), st, Deps{
		Executor:   executor.New(bin, filepath.Join(dir, "exec.json"), nil),
		Auth:       svc,
		BaseConfig: base,
	})
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	logPath := filepath.Join(dir, "cli.log")
	t.Setenv("FAKE_CLI_LOG", logPath)
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, dir, "ok.json", `{"ok":true,"series":"QPN2","mint":"M2","signatures":["s1","s2"]}`))
	return srv, st, logPath, signIn(t, h, st, svc, "issuer"), signIn(t, h, st, svc, "registrar")
}

func postSeries(t *testing.T, url, token, body string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, url+"/issuer/series", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("post series: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return resp.StatusCode, out
}

const seriesBody = `{"name":"QPN2","isin":"KZ2C0QUPON02","faceValue":100000,"couponRateBps":1000,"frequency":2,"dayCount":"THIRTY_360","issueDate":"2026-07-03","maturityDate":"2028-07-03","cash":"tkzt"}`

const wantSeriesArgv = "--json series:create --name QPN2 --isin KZ2C0QUPON02 --face 100000 --rate-bps 1000 --frequency 2 --day-count THIRTY_360 --issue-date 2026-07-03 --maturity-date 2028-07-03 --cash tkzt"

func cliLogLines(t *testing.T, path string) []string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read cli log: %v", err)
	}
	return strings.Split(strings.TrimSpace(string(raw)), "\n")
}

func TestCreateSeries(t *testing.T) {
	srv, st, cliLog, issuer, registrar := issuerServer(t)

	// Wrong role: 403, nothing executed, nothing recorded.
	if code, out := postSeries(t, srv.URL, registrar, seriesBody); code != http.StatusForbidden || out["code"] != "forbidden" {
		t.Fatalf("registrar token: %d %v, want 403 forbidden", code, out)
	}

	// Happy path: 201 with the mint and signatures from the CLI.
	code, out := postSeries(t, srv.URL, issuer, seriesBody)
	if code != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (body %v)", code, out)
	}
	if out["series"] != "QPN2" || out["mint"] != "M2" {
		t.Fatalf("body = %v, want series QPN2 mint M2", out)
	}
	sigs, _ := out["signatures"].([]any)
	if len(sigs) != 2 || sigs[0] != "s1" || sigs[1] != "s2" {
		t.Fatalf("signatures = %v, want [s1 s2]", out["signatures"])
	}
	lines := cliLogLines(t, cliLog)
	if len(lines) != 1 || lines[0] != wantSeriesArgv {
		t.Fatalf("cli argv = %q, want [%q]", lines, wantSeriesArgv)
	}
	rows, err := st.ListRegistry(t.Context())
	if err != nil || len(rows) != 1 || rows[0].Name != "QPN2" || rows[0].Mint != "M2" {
		t.Fatalf("registry = %+v %v, want QPN2 → M2", rows, err)
	}
	audit, err := st.ListAudit(t.Context(), 10)
	if err != nil || len(audit) != 1 || !audit[0].OK || audit[0].Route != "POST /issuer/series" {
		t.Fatalf("audit = %+v %v, want one ok row for POST /issuer/series", audit, err)
	}

	// Duplicate name: 409 series_exists, the CLI is not invoked again.
	if code, out := postSeries(t, srv.URL, issuer, seriesBody); code != http.StatusConflict || out["code"] != "series_exists" {
		t.Fatalf("duplicate: %d %v, want 409 series_exists", code, out)
	}
	if lines := cliLogLines(t, cliLog); len(lines) != 1 {
		t.Fatalf("cli invoked twice: %q", lines)
	}

	// Malformed ISIN: 400 invalid_params before any CLI run or registry row.
	if code, out := postSeries(t, srv.URL, issuer, `{"name":"QPN3","isin":"KZ","faceValue":100000,"couponRateBps":1000,"frequency":2,"dayCount":"THIRTY_360","issueDate":"2026-07-03","maturityDate":"2028-07-03","cash":"tkzt"}`); code != http.StatusBadRequest || out["code"] != "invalid_params" {
		t.Fatalf("bad isin: %d %v, want 400 invalid_params", code, out)
	}
	if lines := cliLogLines(t, cliLog); len(lines) != 1 {
		t.Fatalf("cli ran for a rejected body: %q", lines)
	}
}

func TestCreateSeriesCliFailureRollsBack(t *testing.T) {
	srv, st, _, issuer, _ := issuerServer(t)
	t.Setenv("FAKE_CLI_EXIT", "1")
	t.Setenv("FAKE_CLI_STDERR", writeT(t, t.TempDir(), "err.txt", "qupon: TooEarly: record date not reached\n"))

	code, out := postSeries(t, srv.URL, issuer, seriesBody)
	if code != http.StatusConflict {
		t.Fatalf("status = %d, want 409 (body %v)", code, out)
	}
	if out["code"] != "onchain" || !strings.Contains(fmt.Sprint(out["onchainError"]), "TooEarly") {
		t.Fatalf("body = %v, want code onchain with the CLI message in onchainError", out)
	}
	rows, err := st.ListRegistry(t.Context())
	if err != nil || len(rows) != 0 {
		t.Fatalf("registry after rollback = %+v %v, want empty", rows, err)
	}
	audit, err := st.ListAudit(t.Context(), 10)
	if err != nil || len(audit) != 1 || audit[0].OK {
		t.Fatalf("audit = %+v %v, want one failed row", audit, err)
	}
}
