package api

// POST /issuer/series end-to-end with the fake CLI: a valid body runs
// `series:create`, records the mint in the registry and one audit row; a
// duplicate name never reaches the CLI again; malformed input is rejected
// before any execution; a registrar session gets 403 with nothing executed.

import (
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
	// QPNb1 → fMint so /issuer/actions/{pda}/fund resolves through the fake
	// chain (its series carries fMint); the executor config exists up front so
	// SeriesName works before any /issuer/series call.
	base := filepath.Join(dir, "base.json")
	cfg := fmt.Sprintf(`{"programId":"P","series":{"QPNb1":{"mint":"%s"}}}`, fMint)
	if err := os.WriteFile(base, []byte(cfg), 0o644); err != nil {
		t.Fatalf("write base cfg: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "exec.json"), []byte(cfg), 0o644); err != nil {
		t.Fatalf("write exec cfg: %v", err)
	}
	st, err := store.Open(t.Context(), filepath.Join(dir, "api.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(5, time.Minute)}
	fc := &fakeChain{action: &chain.CorporateAction{Series: fSeries, Index: 3, Status: 2}}
	h := New(slog.New(slog.DiscardHandler), st, Deps{
		Read:       fc,
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
	return postJSON(t, url, "/issuer/series", body, token)
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

var (
	fMintB58   = fMint.String()
	fActionB58 = fAction.String()
)

func TestIssuerAnnounce(t *testing.T) {
	srv, _, cliLog, issuer, registrar := issuerServer(t)
	actions := "/issuer/series/" + fMintB58 + "/actions"

	// Wrong role: 403, nothing executed.
	if code, out := postJSON(t, srv.URL, actions, `{"kind":"INTR","recordAt":100,"paymentAt":200}`, registrar); code != http.StatusForbidden || out["code"] != "forbidden" {
		t.Fatalf("registrar token: %d %v, want 403 forbidden", code, out)
	}

	// Unknown mint: 404 unknown_series, no CLI run.
	if code, out := postJSON(t, srv.URL, "/issuer/series/"+solana.PublicKey{9: 9}.String()+"/actions", `{"kind":"INTR","recordAt":100,"paymentAt":200}`, issuer); code != http.StatusNotFound || out["code"] != "unknown_series" {
		t.Fatalf("unknown mint: %d %v, want 404 unknown_series", code, out)
	}

	// Happy INTR: exact argv, 201 with the action PDA and signatures.
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, t.TempDir(), "ok.json", `{"ok":true,"action":"Act1","signatures":["sa1"]}`))
	code, out := postJSON(t, srv.URL, actions, `{"kind":"INTR","recordAt":100,"paymentAt":200}`, issuer)
	if code != http.StatusCreated || out["action"] != "Act1" {
		t.Fatalf("announce = %d %v, want 201 action Act1", code, out)
	}
	if sigs, _ := out["signatures"].([]any); len(sigs) != 1 || sigs[0] != "sa1" {
		t.Fatalf("signatures = %v, want [sa1]", out["signatures"])
	}

	// MCAL with callDate + corpId: optional flags appended in order.
	code, _ = postJSON(t, srv.URL, actions, `{"kind":"MCAL","recordAt":100,"paymentAt":200,"callDate":"2026-08-20","corpId":"QPN2-MCAL-0001"}`, issuer)
	if code != http.StatusCreated {
		t.Fatalf("mcal status = %d, want 201", code)
	}
	want := []string{
		"--json action:announce --series QPNb1 --kind INTR --record-at 100 --payment-at 200",
		"--json action:announce --series QPNb1 --kind MCAL --record-at 100 --payment-at 200 --call-date 2026-08-20 --corp-id QPN2-MCAL-0001",
	}
	if lines := cliLogLines(t, cliLog); len(lines) != 2 || lines[0] != want[0] || lines[1] != want[1] {
		t.Fatalf("cli argv = %q, want %q", lines, want)
	}

	// PCAL gets its own refusal: it must not be announcable anywhere until pool factors exist (task 1402).
	if code, out := postJSON(t, srv.URL, actions, `{"kind":"PCAL","recordAt":100,"paymentAt":200,"callDate":"2026-08-20","corpId":"QPN2-PCAL-0001"}`, issuer); code != http.StatusBadRequest || out["error"] != "partial calls are not supported yet" {
		t.Fatalf("pcal: %d %v, want 400 'partial calls are not supported yet'", code, out)
	}

	// Rejected bodies never reach the CLI.
	for _, bad := range []string{
		`{"kind":"MCAL","recordAt":100,"paymentAt":200}`,                              // MCAL without callDate
		`{"kind":"INTR","recordAt":100,"paymentAt":200,"callDate":"2026-08-20"}`,      // callDate on INTR
		`{"kind":"INTR","recordAt":200,"paymentAt":100}`,                              // record ≥ payment
		`{"kind":"INTR","recordAt":100,"paymentAt":200,"corpId":"0123456789abcdef0"}`, // corpId > 16 bytes
	} {
		if code, out := postJSON(t, srv.URL, actions, bad, issuer); code != http.StatusBadRequest || out["code"] != "invalid_params" {
			t.Fatalf("body %s: %d %v, want 400 invalid_params", bad, code, out)
		}
	}
	if lines := cliLogLines(t, cliLog); len(lines) != 2 {
		t.Fatalf("cli ran for a rejected body: %q", lines)
	}
}

func TestIssuerMeeting(t *testing.T) {
	srv, _, cliLog, issuer, _ := issuerServer(t)
	meetings := "/issuer/series/" + fMintB58 + "/meetings"

	// rate 0 (or out of range), or voting before record, is rejected before any CLI run.
	for _, bad := range []string{
		`{"newRateBps":0,"recordAt":100,"votingEndsAt":200}`,
		`{"newRateBps":10001,"recordAt":100,"votingEndsAt":200}`,
		`{"newRateBps":900,"recordAt":200,"votingEndsAt":100}`,
	} {
		if code, out := postJSON(t, srv.URL, meetings, bad, issuer); code != http.StatusBadRequest || out["code"] != "invalid_params" {
			t.Fatalf("body %s: %d %v, want 400 invalid_params", bad, code, out)
		}
	}

	t.Setenv("FAKE_CLI_STDOUT", writeT(t, t.TempDir(), "ok.json", `{"ok":true,"action":"Meet1","signatures":["sm1"]}`))
	if code, out := postJSON(t, srv.URL, meetings, `{"newRateBps":900,"recordAt":100,"votingEndsAt":200}`, issuer); code != http.StatusCreated || out["action"] != "Meet1" {
		t.Fatalf("meeting = %d %v, want 201 action Meet1", code, out)
	}
	want := "--json meeting:announce --series QPNb1 --record-at 100 --voting-ends-at 200 --new-rate-bps 900"
	if lines := cliLogLines(t, cliLog); len(lines) != 1 || lines[0] != want {
		t.Fatalf("cli argv = %q, want [%q]", lines, want)
	}
}

func TestIssuerFundTwiceSkips(t *testing.T) {
	srv, st, cliLog, issuer, _ := issuerServer(t)
	fund := "/issuer/actions/" + fActionB58 + "/fund"

	t.Setenv("FAKE_CLI_STDOUT", writeT(t, t.TempDir(), "ok.json", `{"ok":true,"signature":"sig-fund"}`))
	code, out := postJSON(t, srv.URL, fund, "{}", issuer)
	if code != http.StatusOK || out["skipped"] != false {
		t.Fatalf("first fund = %d %v, want 200 skipped false", code, out)
	}
	if sigs, _ := out["signatures"].([]any); len(sigs) != 1 || sigs[0] != "sig-fund" {
		t.Fatalf("signatures = %v, want [sig-fund]", out["signatures"])
	}

	// Second operator double-clicks: the escrow is full, the CLI skips, funds never move twice.
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, t.TempDir(), "skip.json", `{"ok":true,"skipped":true}`))
	code, out = postJSON(t, srv.URL, fund, "{}", issuer)
	if code != http.StatusOK || out["skipped"] != true {
		t.Fatalf("second fund = %d %v, want 200 skipped true", code, out)
	}

	want := "--json action:fund --series QPNb1 --index 3"
	if lines := cliLogLines(t, cliLog); len(lines) != 2 || lines[0] != want || lines[1] != want {
		t.Fatalf("cli argv = %q, want two [%q]", lines, want)
	}
	rows, err := st.ListAudit(t.Context(), 10)
	if err != nil || len(rows) != 2 || !rows[0].OK || !rows[1].OK {
		t.Fatalf("audit = %+v %v, want two ok rows", rows, err)
	}
	for _, row := range rows {
		if row.Route != "POST "+fund {
			t.Fatalf("audit route = %q, want %q", row.Route, "POST "+fund)
		}
	}
}

// A cash mint must be an enabled registry asset of this network; the CLI then gets --cash-mint.
func TestCreateSeriesWithCashMint(t *testing.T) {
	srv, st, cliLog, issuer, _ := issuerServer(t)
	const kzte = "HQWXGhNN3SUuaauG1z3vTjzfHRshJxdRYLF9gzzhFmsF"
	body := strings.Replace(seriesBody, `"cash":"tkzt"`, `"cashMint":"`+kzte+`"`, 1)

	if code, out := postSeries(t, srv.URL, issuer, body); code != http.StatusBadRequest || out["code"] != "asset_not_enabled" {
		t.Fatalf("unregistered mint: %d %v", code, out)
	}
	asset := store.CashAsset{Network: "devnet", Mint: kzte, Symbol: "KZTE-dev", Name: "Evo (devnet)", Decimals: 2,
		TokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", Kind: "stablecoin"}
	if err := st.UpsertCashAsset(t.Context(), asset); err != nil {
		t.Fatal(err)
	}
	if code, out := postSeries(t, srv.URL, issuer, body); code != http.StatusBadRequest || out["code"] != "asset_not_enabled" {
		t.Fatalf("disabled asset: %d %v", code, out)
	}
	if _, err := os.Stat(cliLog); err == nil && len(cliLogLines(t, cliLog)) > 0 {
		t.Fatal("cli ran for a rejected asset")
	}
	asset.Enabled = true
	if err := st.UpsertCashAsset(t.Context(), asset); err != nil {
		t.Fatal(err)
	}
	if code, out := postSeries(t, srv.URL, issuer, body); code != http.StatusCreated {
		t.Fatalf("enabled asset: %d %v", code, out)
	}
	want := strings.Replace(wantSeriesArgv, "--cash tkzt", "--cash-mint "+kzte, 1)
	if lines := cliLogLines(t, cliLog); len(lines) != 1 || lines[0] != want {
		t.Fatalf("argv = %q, want %q", lines, want)
	}
	rows, _ := st.ListRegistry(t.Context())
	if len(rows) != 1 || !strings.Contains(string(rows[0].Terms), `"cashMint":"`+kzte+`"`) {
		t.Fatalf("registry terms = %+v", rows)
	}

	both := strings.Replace(seriesBody, `"cash":"tkzt"`, `"cash":"tkzt","cashMint":"`+kzte+`"`, 1)
	if code, out := postSeries(t, srv.URL, issuer, both); code != http.StatusBadRequest || out["code"] != "invalid_params" {
		t.Fatalf("both cash fields: %d %v", code, out)
	}
}
