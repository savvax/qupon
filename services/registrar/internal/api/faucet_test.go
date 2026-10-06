package api

import (
	"crypto/ed25519"
	"crypto/rand"
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
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/network"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// KZTE-dev mint created by scripts/create-test-asset.ts (values only — public keys).
const (
	fKzte = "7H3MbktQifAeYqKS44ar9ck1c4kQZ3Sgj36bmQzm2atq"
	fDkzt = "WsSWxpZXuuDcBmymLitFpvfEWWebiBUXBRNQRFBT29k"
)

type faucetEnv struct {
	t   *testing.T
	h   http.Handler
	st  *store.Store
	log string
}

// faucetServer builds the API with the fake CLI, a user with a linked wallet and a base config
// carrying the two test assets.
func faucetServer(t *testing.T, profile network.Profile) *faucetEnv {
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
	if err := os.WriteFile(cfg, []byte(fmt.Sprintf(`{"testAssets":[
		{"symbol":"KZTE-dev","mint":"%s","decimals":2,"kind":"stablecoin"},
		{"symbol":"dKZT","mint":"%s","decimals":2,"kind":"wrapped_cbdc"},
		{"symbol":"REAL","mint":"EiAZ7r9tVciGeibwdFmjbhhZVeSGXxY2CMuqP71MaN6g","decimals":6,"kind":"spl"}]}`,
		fKzte, fDkzt)), 0o644); err != nil {
		t.Fatal(err)
	}
	st, err := store.Open(t.Context(), filepath.Join(dir, "faucet.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(50, time.Minute)}
	e := &faucetEnv{t: t, st: st,
		h: New(slog.New(slog.DiscardHandler), st, Deps{
			Auth: svc, Executor: executor.New(bin, cfg, nil), BaseConfig: cfg, Network: profile,
		})}
	e.log = filepath.Join(dir, "cli.log")
	t.Setenv("FAKE_CLI_LOG", e.log)
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, dir, "ok.json", `{"ok":true,"signature":"sig-faucet","ata":"AtaFake1111111111111111111111111111111111"}`))
	return e
}

func (e *faucetEnv) call(method, path, body, token string) (int, map[string]any) {
	e.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

// userWithWallet signs a user in and links a verified wallet, returning the token and address.
func (e *faucetEnv) userWithWallet(email string) (string, string) {
	e.t.Helper()
	hash, _ := auth.HashPassword("pw-123456789")
	if _, err := e.st.UpsertUser(e.t.Context(), store.User{Email: email, Name: email, Role: "investor"}, hash); err != nil {
		e.t.Fatal(err)
	}
	code, body := e.call("POST", "/auth/login", `{"email":"`+email+`","password":"pw-123456789"}`, "")
	if code != 200 {
		e.t.Fatalf("login %s: %d %v", email, code, body)
	}
	token := body["token"].(string)
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		e.t.Fatal(err)
	}
	addr := solana.PublicKeyFromBytes(pub).String()
	code, body = e.call("POST", "/me/wallets/challenge", `{"address":"`+addr+`"}`, token)
	if code != 200 {
		e.t.Fatalf("challenge: %d %v", code, body)
	}
	msg := body["message"].(string)
	sig := solana.SignatureFromBytes(ed25519.Sign(priv, []byte(msg))).String()
	if code, body = e.call("POST", "/me/wallets", `{"address":"`+addr+`","signature":"`+sig+`"}`, token); code != 201 {
		e.t.Fatalf("link: %d %v", code, body)
	}
	return token, addr
}

func TestFaucetMainnetForbidden(t *testing.T) {
	e := faucetServer(t, network.Profile{Name: "mainnet-beta", Mainnet: true})
	tok, _ := e.userWithWallet("a@q.kz")
	code, body := e.call("POST", "/me/faucet", `{"mint":"`+fKzte+`"}`, tok)
	if code != http.StatusForbidden || body["code"] != "mainnet" {
		t.Fatalf("mainnet faucet: %d %v", code, body)
	}
}

func TestFaucetHappyPathThenRateLimited(t *testing.T) {
	e := faucetServer(t, network.Profile{Name: "devnet"})
	tok, addr := e.userWithWallet("a@q.kz")

	// second user is not throttled by the first (limit is per user per mint)
	tok2, _ := e.userWithWallet("b@q.kz")
	code, body := e.call("POST", "/me/faucet", `{"mint":"`+fDkzt+`"}`, tok2)
	if code != 200 || body["ok"] != true || body["signature"] != "sig-faucet" || body["ata"] == "" {
		t.Fatalf("second user: %d %v", code, body)
	}

	code, body = e.call("POST", "/me/faucet", `{"mint":"`+fKzte+`"}`, tok)
	if code != 200 || body["ok"] != true || body["symbol"] != "KZTE-dev" || body["amount"].(float64) != 10_000_000 {
		t.Fatalf("first call: %d %v", code, body)
	}
	// the CLI got the first verified wallet and 100,000 major units (2 decimals)
	logRaw, err := os.ReadFile(e.log)
	if err != nil {
		t.Fatal(err)
	}
	argv := string(logRaw)
	want := "asset:faucet --mint " + fKzte + " --to " + addr + " --amount 10000000"
	if !strings.Contains(argv, want) {
		t.Fatalf("cli argv = %q, want %q", argv, want)
	}

	// second call for the same mint inside the hour → 429; another mint still works
	code, body = e.call("POST", "/me/faucet", `{"mint":"`+fKzte+`"}`, tok)
	if code != http.StatusTooManyRequests || body["code"] != "rate_limited" {
		t.Fatalf("second call: %d %v", code, body)
	}
	if code, _ := e.call("POST", "/me/faucet", `{"mint":"`+fDkzt+`"}`, tok); code != 200 {
		t.Fatalf("other mint after 429: %d", code)
	}
}

func TestFaucetRejects(t *testing.T) {
	e := faucetServer(t, network.Profile{Name: "devnet"})
	tok, _ := e.userWithWallet("a@q.kz")
	// unknown mint — a valid address that is not in testAssets
	code, body := e.call("POST", "/me/faucet", `{"mint":"DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo"}`, tok)
	if code != http.StatusNotFound || body["code"] != "asset_not_found" {
		t.Fatalf("unknown mint: %d %v", code, body)
	}
	// registered asset but kind spl — real tokens are not test cash
	code, body = e.call("POST", "/me/faucet", `{"mint":"EiAZ7r9tVciGeibwdFmjbhhZVeSGXxY2CMuqP71MaN6g"}`, tok)
	if code != http.StatusBadRequest || body["code"] != "not_a_test_asset" {
		t.Fatalf("spl kind: %d %v", code, body)
	}
	// garbage address
	if code, _ := e.call("POST", "/me/faucet", `{"mint":"not-an-address"}`, tok); code != http.StatusBadRequest {
		t.Fatalf("garbage mint: %d", code)
	}
	// user without a linked wallet
	hash, _ := auth.HashPassword("pw-123456789")
	if _, err := e.st.UpsertUser(t.Context(), store.User{Email: "n@q.kz", Name: "n", Role: "investor"}, hash); err != nil {
		t.Fatal(err)
	}
	code, body = e.call("POST", "/auth/login", `{"email":"n@q.kz","password":"pw-123456789"}`, "")
	if code != 200 {
		t.Fatalf("login: %d", code)
	}
	code, body = e.call("POST", "/me/faucet", `{"mint":"`+fKzte+`"}`, body["token"].(string))
	if code != http.StatusBadRequest || body["code"] != "wallet_not_linked" {
		t.Fatalf("no wallet: %d %v", code, body)
	}
	// anonymous
	if code, _ := e.call("POST", "/me/faucet", `{"mint":"`+fKzte+`"}`, ""); code != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d", code)
	}
}
