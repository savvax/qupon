package api

// Wrapped-CBDC custodian tests (task 606): the SIMULATED custodian mints dKZT
// on deposit, burns on withdrawal, and every movement lands in the audit-ledger
// read. Same fake-CLI env as faucet_test.go.

import (
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
	"github.com/qupon-kz/qupon/services/registrar/internal/network"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// custodianAdmin signs an admin in on the env, returning the bearer token.
func custodianAdmin(t *testing.T, e *faucetEnv) string {
	t.Helper()
	hash, _ := auth.HashPassword("pw-123456789")
	if _, err := e.st.UpsertUser(t.Context(), store.User{Email: "admin@q.kz", Name: "admin", Role: "admin"}, hash); err != nil {
		t.Fatal(err)
	}
	code, body := e.call("POST", "/auth/login", `{"email":"admin@q.kz","password":"pw-123456789"}`, "")
	if code != 200 {
		t.Fatalf("admin login: %d %v", code, body)
	}
	return body["token"].(string)
}

// custodianServer is a fake-CLI devnet env whose base config carries the given
// testAssets entries (used to test a network without a wrapped_cbdc asset).
func custodianServer(t *testing.T, testAssets string) *faucetEnv {
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
	cfg := filepath.Join(dir, "assets.json")
	if err := os.WriteFile(cfg, []byte(`{"testAssets":[`+testAssets+`]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	st, err := store.Open(t.Context(), filepath.Join(dir, "custodian.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(50, time.Minute)}
	e := &faucetEnv{t: t, st: st,
		h: New(slog.New(slog.DiscardHandler), st, Deps{
			Auth: svc, Executor: executor.New(bin, cfg, nil), BaseConfig: cfg, Network: network.Profile{Name: "devnet"},
		})}
	e.log = filepath.Join(dir, "cli.log")
	t.Setenv("FAKE_CLI_LOG", e.log)
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, dir, "ok.json", `{"ok":true,"signature":"sig-faucet","ata":"AtaFake1111111111111111111111111111111111"}`))
	return e
}

func TestCustodianAccessControl(t *testing.T) {
	e := faucetServer(t, network.Profile{Name: "devnet"})
	tok, _ := e.userWithWallet("inv@q.kz")
	// an investor (any non-admin) is refused; so is an anonymous caller
	if code, body := e.call("GET", "/admin/custodian", "", tok); code != http.StatusForbidden || body["code"] != "forbidden" {
		t.Fatalf("investor GET: %d %v", code, body)
	}
	if code, body := e.call("POST", "/admin/custodian/deposit", `{"reference":"r","amount":1,"to":"`+fDkzt+`"}`, tok); code != http.StatusForbidden {
		t.Fatalf("investor POST: %d %v", code, body)
	}
	if code, _ := e.call("GET", "/admin/custodian", "", ""); code != http.StatusUnauthorized {
		t.Fatalf("anonymous GET: %d", code)
	}
}

func TestCustodianDepositMintsAndLedgerShowsIt(t *testing.T) {
	e := faucetServer(t, network.Profile{Name: "devnet"})
	tok := custodianAdmin(t, e)
	treasury := "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" // base58, any treasury owner

	code, body := e.call("POST", "/admin/custodian/deposit",
		`{"reference":"CBDC-2026-001","amount":50000,"to":"`+treasury+`"}`, tok)
	if code != 200 || body["ok"] != true || body["signature"] != "sig-faucet" || body["explorerUrl"] == "" {
		t.Fatalf("deposit: %d %v", code, body)
	}
	if body["amount"].(float64) != 5_000_000 { // 2 decimals
		t.Fatalf("deposit minor units: %v", body["amount"])
	}
	argv := readCliLog(t, e)
	want := "asset:mint --mint " + fDkzt + " --to " + treasury + " --amount 5000000 --memo CBDC-2026-001"
	if !strings.Contains(argv, want) {
		t.Fatalf("cli argv = %q, want %q", argv, want)
	}

	// the ledger read shows the movement with the admin's email and signature
	code, body = e.call("GET", "/admin/custodian", "", tok)
	if code != 200 {
		t.Fatalf("status: %d %v", code, body)
	}
	asset := body["asset"].(map[string]any)
	if asset["symbol"] != "dKZT" || asset["mint"] != fDkzt || asset["decimals"].(float64) != 2 {
		t.Fatalf("asset: %v", asset)
	}
	ledger := body["ledger"].([]any)
	if len(ledger) != 1 {
		t.Fatalf("ledger: %v", ledger)
	}
	row := ledger[0].(map[string]any)
	if row["kind"] != "deposit" || row["reference"] != "CBDC-2026-001" ||
		row["amount"].(float64) != 5_000_000 || row["to"] != treasury ||
		row["email"] != "admin@q.kz" || row["signature"] != "sig-faucet" || row["ok"] != true {
		t.Fatalf("ledger row: %v", row)
	}
	if detail, _ := row["detail"].(string); !strings.Contains(detail, "SIMULATED") {
		t.Fatalf("detail not labelled SIMULATED: %v", row["detail"])
	}
}

func TestCustodianWithdrawBurns(t *testing.T) {
	e := faucetServer(t, network.Profile{Name: "devnet"})
	tok := custodianAdmin(t, e)

	code, body := e.call("POST", "/admin/custodian/withdraw", `{"reference":"CBDC-OUT-7","amount":2500}`, tok)
	if code != 200 || body["ok"] != true {
		t.Fatalf("withdraw: %d %v", code, body)
	}
	want := "asset:burn --mint " + fDkzt + " --amount 250000 --memo CBDC-OUT-7"
	if argv := readCliLog(t, e); !strings.Contains(argv, want) {
		t.Fatalf("cli argv = %q, want %q", argv, want)
	}
	// no `to` on a withdrawal row
	_, body = e.call("GET", "/admin/custodian", "", tok)
	row := body["ledger"].([]any)[0].(map[string]any)
	if row["kind"] != "withdraw" || row["reference"] != "CBDC-OUT-7" {
		t.Fatalf("ledger row: %v", row)
	}
	if _, has := row["to"]; has {
		t.Fatalf("withdraw row must not carry a treasury: %v", row)
	}
}

func TestCustodianRejectsBadInput(t *testing.T) {
	e := faucetServer(t, network.Profile{Name: "devnet"})
	tok := custodianAdmin(t, e)
	cases := []struct {
		name, body string
	}{
		{"empty reference", `{"reference":"","amount":10,"to":"` + fDkzt + `"}`},
		{"control chars in reference", "{\"reference\":\"a\nb\",\"amount\":10,\"to\":\"" + fDkzt + "\"}"},
		{"zero amount", `{"reference":"r","amount":0,"to":"` + fDkzt + `"}`},
		{"amount over cap", `{"reference":"r","amount":1000000001,"to":"` + fDkzt + `"}`},
		{"bad treasury", `{"reference":"r","amount":10,"to":"not-an-address"}`},
	}
	for _, c := range cases {
		if code, body := e.call("POST", "/admin/custodian/deposit", c.body, tok); code != http.StatusBadRequest || body["code"] != "invalid_params" {
			t.Fatalf("%s: %d %v", c.name, code, body)
		}
	}
}

func TestCustodianNoWrappedAssetConfigured(t *testing.T) {
	// a network whose testAssets carry no wrapped_cbdc entry has no custodian
	e := custodianServer(t, `"symbol":"KZTE-dev","mint":"`+fKzte+`","decimals":2,"kind":"stablecoin"`)
	tok := custodianAdmin(t, e)
	code, body := e.call("POST", "/admin/custodian/deposit", `{"reference":"r","amount":1,"to":"`+fDkzt+`"}`, tok)
	if code != http.StatusNotFound || body["code"] != "asset_not_found" {
		t.Fatalf("no wrapped asset: %d %v", code, body)
	}
	// the status read reports asset:null instead of guessing a mint
	code, body = e.call("GET", "/admin/custodian", "", tok)
	if code != 200 || body["asset"] != nil {
		t.Fatalf("status without asset: %d %v", code, body)
	}
}

func TestCustodianMainnetForbidden(t *testing.T) {
	e := faucetServer(t, network.Profile{Name: "mainnet-beta", Mainnet: true})
	tok := custodianAdmin(t, e)
	body := `{"reference":"r","amount":1,"to":"` + fDkzt + `"}`
	// the typed-confirmation guard (task 605) runs first: without the header the write is 428
	if code, _ := e.call("POST", "/admin/custodian/deposit", body, tok); code != http.StatusPreconditionRequired {
		t.Fatalf("unconfirmed mainnet write: %d", code)
	}
	req := httptest.NewRequest(http.MethodPost, "/admin/custodian/deposit", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set(ConfirmHeader, "mainnet-beta")
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if rec.Code != http.StatusForbidden || out["code"] != "mainnet" {
		t.Fatalf("mainnet custodian: %d %v", rec.Code, out)
	}
}

func TestCustodianCliFailureAudited(t *testing.T) {
	e := faucetServer(t, network.Profile{Name: "devnet"})
	tok := custodianAdmin(t, e)
	t.Setenv("FAKE_CLI_EXIT", "1")
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, t.TempDir(), "err.json", `{"ok":false,"error":"treasury balance too low"}`))

	code, _ := e.call("POST", "/admin/custodian/withdraw", `{"reference":"CBDC-OUT-8","amount":10}`, tok)
	if code != http.StatusConflict {
		t.Fatalf("cli failure: %d", code)
	}
	// the failed move stays in the ledger, marked not ok
	_, body := e.call("GET", "/admin/custodian", "", tok)
	rows := body["ledger"].([]any)
	if len(rows) != 1 {
		t.Fatalf("ledger after failure: %v", rows)
	}
	row := rows[0].(map[string]any)
	if row["ok"] != false || row["reference"] != "CBDC-OUT-8" {
		t.Fatalf("failed ledger row: %v", row)
	}
	if detail, _ := row["detail"].(string); !strings.Contains(detail, "SIMULATED") || !strings.Contains(detail, "treasury balance too low") {
		t.Fatalf("failure detail: %v", row["detail"])
	}
}

func readCliLog(t *testing.T, e *faucetEnv) string {
	t.Helper()
	raw, err := os.ReadFile(e.log)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}
