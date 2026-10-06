package api

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

type walletEnv struct {
	t   *testing.T
	h   http.Handler
	st  *store.Store
	now time.Time
}

func newWalletEnv(t *testing.T) *walletEnv {
	t.Helper()
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "w.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	e := &walletEnv{t: t, st: st, now: time.Unix(1_800_000_000, 0)}
	svc := &auth.Service{Store: st, Now: func() time.Time { return e.now }, TTL: 24 * time.Hour, DemoLogin: true,
		Limit: auth.NewLimiter(50, time.Minute)}
	e.h = New(slog.New(slog.DiscardHandler), st, Deps{Auth: svc})
	return e
}

func (e *walletEnv) user(email string) string {
	e.t.Helper()
	hash, _ := auth.HashPassword("pw-123456789")
	if _, err := e.st.UpsertUser(e.t.Context(), store.User{Email: email, Name: email, Role: "investor"}, hash); err != nil {
		e.t.Fatal(err)
	}
	code, body := e.call("POST", "/auth/login", `{"email":"`+email+`","password":"pw-123456789"}`, "")
	if code != 200 {
		e.t.Fatalf("login %s: %d %v", email, code, body)
	}
	return body["token"].(string)
}

func (e *walletEnv) call(method, path, body, token string) (int, map[string]any) {
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

type keypair struct {
	addr string
	priv ed25519.PrivateKey
}

func newKey(t *testing.T) keypair {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return keypair{addr: solana.PublicKeyFromBytes(pub).String(), priv: priv}
}

func (k keypair) sign(msg string) string {
	return solana.SignatureFromBytes(ed25519.Sign(k.priv, []byte(msg))).String()
}

// challenge asks for a link message for addr and returns it.
func (e *walletEnv) challenge(token, addr string) string {
	e.t.Helper()
	code, body := e.call("POST", "/me/wallets/challenge", `{"address":"`+addr+`"}`, token)
	if code != 200 {
		e.t.Fatalf("challenge: %d %v", code, body)
	}
	return body["message"].(string)
}

func (e *walletEnv) link(token, addr, sig string) (int, string) {
	e.t.Helper()
	code, body := e.call("POST", "/me/wallets", `{"address":"`+addr+`","signature":"`+sig+`"}`, token)
	c, _ := body["code"].(string)
	return code, c
}

func TestWalletLinkHappyPathAndReplay(t *testing.T) {
	e := newWalletEnv(t)
	tok := e.user("a@q.kz")
	k := newKey(t)
	msg := e.challenge(tok, k.addr)
	if !strings.Contains(msg, "a@q.kz") || !strings.Contains(msg, k.addr) {
		t.Fatalf("message must name the account and the address: %q", msg)
	}
	sig := k.sign(msg)
	if code, c := e.link(tok, k.addr, sig); code != http.StatusCreated {
		t.Fatalf("link: %d %s", code, c)
	}
	if code, c := e.link(tok, k.addr, sig); code != http.StatusBadRequest || c != "no_challenge" {
		t.Fatalf("replayed signature: %d %s", code, c)
	}
	code, body := e.call("GET", "/me/wallets", "", tok)
	ws, _ := body["wallets"].([]any)
	if code != 200 || len(ws) != 1 || ws[0].(map[string]any)["address"] != k.addr {
		t.Fatalf("list: %d %v", code, body)
	}
	// relinking the same wallet with a fresh challenge is idempotent
	if code, c := e.link(tok, k.addr, k.sign(e.challenge(tok, k.addr))); code != http.StatusCreated {
		t.Fatalf("relink: %d %s", code, c)
	}
}

func TestWalletLinkRejects(t *testing.T) {
	e := newWalletEnv(t)
	alice, bob := e.user("alice@q.kz"), e.user("bob@q.kz")
	ka, kb := newKey(t), newKey(t)

	// a signature by another key over the right message
	msg := e.challenge(alice, ka.addr)
	if code, c := e.link(alice, ka.addr, kb.sign(msg)); code != 400 || c != "bad_signature" {
		t.Fatalf("foreign key: %d %s", code, c)
	}
	// a valid signature presented for a different address (no challenge for it)
	if code, c := e.link(alice, kb.addr, ka.sign(msg)); code != 400 || c != "no_challenge" {
		t.Fatalf("other address: %d %s", code, c)
	}
	// alice's signed message replayed by bob for the same address: the message names alice's email
	_ = e.challenge(bob, ka.addr)
	if code, c := e.link(bob, ka.addr, ka.sign(msg)); code != 400 || c != "bad_signature" {
		t.Fatalf("cross-user replay: %d %s", code, c)
	}
	// garbage signature
	if code, c := e.link(alice, ka.addr, "not-base58!"); code != 400 || c != "bad_signature" {
		t.Fatalf("garbage: %d %s", code, c)
	}
	// expired challenge
	msg = e.challenge(alice, ka.addr)
	e.now = e.now.Add(walletChallengeTTL + time.Second)
	if code, c := e.link(alice, ka.addr, ka.sign(msg)); code != 400 || c != "no_challenge" {
		t.Fatalf("expired: %d %s", code, c)
	}
}

func TestWalletTakenDemoAndDelete(t *testing.T) {
	e := newWalletEnv(t)
	alice, bob := e.user("alice@q.kz"), e.user("bob@q.kz")
	k := newKey(t)
	if code, _ := e.link(alice, k.addr, k.sign(e.challenge(alice, k.addr))); code != 201 {
		t.Fatal("alice link failed")
	}
	if code, c := e.link(bob, k.addr, k.sign(e.challenge(bob, k.addr))); code != http.StatusConflict || c != "wallet_taken" {
		t.Fatalf("taken: %d %s", code, c)
	}
	if code, _ := e.call("DELETE", "/me/wallets/"+k.addr, "", bob); code != http.StatusNotFound {
		t.Fatalf("bob deleted alice's wallet: %d", code)
	}
	if code, _ := e.call("DELETE", "/me/wallets/"+k.addr, "", alice); code != 200 {
		t.Fatalf("delete own: %d", code)
	}

	if _, err := e.st.UpsertUser(t.Context(), store.User{Email: "demo-investor@qupon.demo", Name: "Demo", Role: "investor_demo", IsDemo: true}, "!"); err != nil {
		t.Fatal(err)
	}
	code, body := e.call("POST", "/auth/demo", `{"role":"investor"}`, "")
	if code != 200 {
		t.Fatalf("demo login: %d %v", code, body)
	}
	if code, b := e.call("POST", "/me/wallets/challenge", `{"address":"`+k.addr+`"}`, body["token"].(string)); code != 403 || b["code"] != "demo_account" {
		t.Fatalf("demo challenge: %d %v", code, b)
	}
	if code, _ := e.call("GET", "/me/wallets", "", ""); code != http.StatusUnauthorized {
		t.Fatalf("anonymous list: %d", code)
	}
}
