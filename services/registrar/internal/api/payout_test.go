package api

// Bank-routed payouts (plan 15 D6): the public bank-pending read joins entitlements with the
// holders' payout routes, and POST /actions/{pda}/confirm-bank runs `payout:confirm-bank` for
// the paying agent (or registrar) with the fake CLI — same contract as the advance tests.

import (
	"context"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// The pre-payout fakes satisfy the widened ReadModel with "no routes".
func (f *fakeChain) FetchPayoutRoutesBySeries(context.Context, solana.PublicKey) ([]chain.PayoutRouteRecord, error) {
	return nil, nil
}
func (fakeRead) FetchPayoutRoutesBySeries(context.Context, solana.PublicKey) ([]chain.PayoutRouteRecord, error) {
	return nil, nil
}

var fInvA = solana.PublicKey{12: 1} // Investor PDA of fOwnerA

// payoutChain is fakeChain plus one bank-routed holder awaiting confirmation (fOwnerA, PaidToAgent)
// and one already paid to the wallet (fOwnerB).
type payoutChain struct {
	*fakeChain
	ents      []chain.EntitlementRecord
	investors []chain.InvestorRecord
	routes    []chain.PayoutRouteRecord
}

func (f *payoutChain) FetchEntitlementsByAction(context.Context, solana.PublicKey) ([]chain.EntitlementRecord, error) {
	return f.ents, nil
}
func (f *payoutChain) FetchInvestorsBySeries(context.Context, solana.PublicKey) ([]chain.InvestorRecord, error) {
	return f.investors, nil
}
func (f *payoutChain) FetchPayoutRoutesBySeries(context.Context, solana.PublicKey) ([]chain.PayoutRouteRecord, error) {
	return f.routes, nil
}

func newPayoutChain() *payoutChain {
	var hash [32]byte
	hash[0], hash[31] = 0xab, 0xcd
	return &payoutChain{
		fakeChain: &fakeChain{action: &chain.CorporateAction{
			Series: fSeries, Index: 0, Status: 4, BankPending: 1, CashMint: fCash,
		}},
		ents: []chain.EntitlementRecord{
			{PDA: solana.PublicKey{10: 4}, Entitlement: &chain.Entitlement{Owner: fOwnerA, Units: 10, Net: 50_000, Principal: 25_000, Status: 3}},
			{PDA: solana.PublicKey{10: 2}, Entitlement: &chain.Entitlement{Owner: fOwnerB, Units: 25, Net: 125_000, Status: 1}},
		},
		investors: []chain.InvestorRecord{{PDA: fInvA, Investor: &chain.Investor{Series: fSeries, Owner: fOwnerA, BondATA: fBondATAA}}},
		routes:    []chain.PayoutRouteRecord{{PDA: solana.PublicKey{13: 1}, Route: &chain.PayoutRoute{Investor: fInvA, Route: 1, BankRefHash: hash}}},
	}
}

// payoutServer: demoServer's setup plus a paying_agent and an issuer token for the role matrix.
func payoutServer(t *testing.T, fc ReadModel) (url string, st *store.Store, log, agent, reg, issuer string) {
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
	st, err = store.Open(t.Context(), filepath.Join(dir, "payout.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(5, time.Minute)}
	h := New(slog.New(slog.DiscardHandler), st, Deps{Read: fc, Executor: executor.New(bin, cfg, nil), Auth: svc})
	login := func(email, role, pw string) string {
		hash, _ := auth.HashPassword(pw)
		if _, err := st.UpsertUser(t.Context(), store.User{Email: email, Name: role, Role: role}, hash); err != nil {
			t.Fatal(err)
		}
		tok, _, err := svc.Login(t.Context(), email, pw)
		if err != nil {
			t.Fatal(err)
		}
		return tok
	}
	agent = login("agent@test.kz", "paying_agent", "pw-agent")
	reg = login("op@test.kz", "registrar", "pw-reg")
	issuer = login("issuer@test.kz", "issuer", "pw-issuer")
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	log = filepath.Join(dir, "cli.log")
	t.Setenv("FAKE_CLI_LOG", log)
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, dir, "ok.json", `{"ok":true,"signature":"sig-payout","slot":"42"}`))
	return srv.URL, st, log, agent, reg, issuer
}

func TestBankPendingList(t *testing.T) {
	srv := restServer(t, newPayoutChain())

	var got struct {
		BankPending uint32              `json:"bankPending"`
		Items       []BankPendingPayout `json:"items"`
	}
	getJSON(t, srv.URL+"/actions/"+fAction.String()+"/bank-pending", http.StatusOK, &got)
	want := []BankPendingPayout{{
		Owner: fOwnerA.String(), EntitlementPda: solana.PublicKey{10: 4}.String(),
		Amount:           Amount{Minor: "75000", Display: "750.00 tKZT", Currency: "tKZT"},
		RouteBankRefHash: hex.EncodeToString([]byte{0xab, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xcd}),
	}}
	if got.BankPending != 1 || !reflect.DeepEqual(got.Items, want) {
		t.Fatalf("bank-pending = %d %+v, want 1 %+v", got.BankPending, got.Items, want)
	}

	getJSON(t, srv.URL+"/actions/"+solana.PublicKey{9: 9}.String()+"/bank-pending", http.StatusNotFound, nil)
}

func TestConfirmBankPayout(t *testing.T) {
	url, st, log, agent, reg, issuer := payoutServer(t, newPayoutChain())
	path := "/actions/" + fAction.String() + "/confirm-bank"
	body := `{"owner":"` + fOwnerA.String() + `","reference":"REF-12345"}`

	// Happy path — the paying agent confirms; the registrar may do it too (task 91522). Distinct fake
	// signatures: the activity feed dedups by (sig, kind) like every ingest.
	for i, tok := range []string{agent, reg} {
		if i == 1 {
			t.Setenv("FAKE_CLI_STDOUT", writeT(t, t.TempDir(), "ok2.json", `{"ok":true,"signature":"sig-payout-2","slot":"43"}`))
		}
		wantSig := []string{"sig-payout", "sig-payout-2"}[i]
		code, out := postJSON(t, url, path, body, tok)
		if code != http.StatusOK || out["ok"] != true || out["explorerUrl"] == nil {
			t.Fatalf("confirm run %d = %d %v, want 200 ok with the tx", i, code, out)
		}
		if out["signature"] != wantSig {
			t.Fatalf("confirm run %d signature = %v, want %s", i, out["signature"], wantSig)
		}
	}
	wantArgv := "--json payout:confirm-bank --series QPNb1 --index 0 --owner " + fOwnerA.String() + " --reference REF-12345"
	if got := cliLines(t, log); len(got) != 2 || got[0] != wantArgv || got[1] != wantArgv {
		t.Fatalf("cli log = %q, want two runs of %q", got, wantArgv)
	}

	// Activity rows: kind advance:confirm_bank_payout, the raw reference never in the audit trail.
	events, err := st.ListActivity(t.Context(), 10)
	if err != nil || len(events) != 2 {
		t.Fatalf("activity rows = %d (err %v), want one per confirmation", len(events), err)
	}
	for i, e := range events {
		wantSig := []string{"sig-payout", "sig-payout-2"}[i]
		if e.Kind != "advance:confirm_bank_payout" || e.Sig != wantSig || e.ActionPDA == nil {
			t.Fatalf("activity = %+v, want advance:confirm_bank_payout/%s", e, wantSig)
		}
		if !strings.Contains(string(e.Payload), fOwnerA.String()) || strings.Contains(string(e.Payload), "REF-12345") {
			t.Fatalf("activity payload = %s, want the owner but not the raw reference", e.Payload)
		}
	}

	// Refused requests never reach the CLI.
	before := len(cliLines(t, log))
	tests := []struct {
		name, body, token string
		want              int
	}{
		{"wrong role", body, issuer, http.StatusForbidden},
		{"no session", body, "", http.StatusUnauthorized},
		{"empty reference", `{"owner":"` + fOwnerA.String() + `","reference":"  "}`, agent, http.StatusBadRequest},
		{"bad owner", `{"owner":"notabase58","reference":"REF"}`, agent, http.StatusBadRequest},
		{"owner paid to the wallet", `{"owner":"` + fOwnerB.String() + `","reference":"REF"}`, agent, http.StatusConflict},
		{"unknown owner", `{"owner":"` + solana.PublicKey{9: 9}.String() + `","reference":"REF"}`, agent, http.StatusConflict},
	}
	for _, tt := range tests {
		if code, _ := postJSON(t, url, path, tt.body, tt.token); code != tt.want {
			t.Fatalf("%s: status = %d, want %d", tt.name, code, tt.want)
		}
	}
	if got := len(cliLines(t, log)); got != before {
		t.Fatalf("a refused request ran the CLI: %d runs, want %d", got, before)
	}

	// The chain said no (already confirmed): 409 with the CLI's message.
	t.Setenv("FAKE_CLI_EXIT", "1")
	t.Setenv("FAKE_CLI_STDOUT", "")
	t.Setenv("FAKE_CLI_STDERR", writeT(t, t.TempDir(), "err.txt", "qupon: NotPaidToAgent\n"))
	code, out := postJSON(t, url, path, body, agent)
	if code != http.StatusConflict || !strings.Contains(fmt.Sprint(out["error"]), "NotPaidToAgent") {
		t.Fatalf("on-chain refusal = %d %v, want 409 with the CLI message", code, out)
	}
}

// Plan 15 D4: declare_default needs no endpoint of its own — once the funding deadline passed,
// POST /advance maps the waiting action to `action:default`, which anyone may sign on-chain.
func TestAdvanceDeclaresDefaultWhenDue(t *testing.T) {
	fc := &fakeChain{action: &chain.CorporateAction{
		Series: fSeries, Kind: 0, Status: 2, CashMint: fCash,
		PaymentAt: time.Now().Add(-48 * time.Hour).Unix(), // past the one-series-day grace
	}}
	srv, _, log := advanceServer(t, fc)

	code, body := postAdvance(t, srv.URL, `{"confirm":true}`)
	if code != http.StatusOK || body["step"] != "declare_default" || body["ok"] != true {
		t.Fatalf("advance = %d %v, want step declare_default", code, body)
	}
	if got := cliLines(t, log); len(got) != 1 || got[0] != "--json action:default --series QPNb1 --index 0" {
		t.Fatalf("cli log = %q, want the default declaration", got)
	}
}
