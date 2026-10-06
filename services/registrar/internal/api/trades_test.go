package api

// Secondary trades (trades.go) against a fake chain and the fake CLI: the read model derives status from the two
// escrow accounts, the registrar writes are role-gated and run the trade:* commands with the expected argv, a
// trade that is not admitted is 404 before any CLI run, and demo funding signs only for a configured investor.
// Numbers: the reference trade of plan 13 — 5 bonds at par = 500,000 tiyn (face 1,000.00).

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
)

// The pre-trades fakes satisfy the widened ReadModel with "no trades".
func (f *fakeChain) FetchTradeAdmissionsBySeries(context.Context, solana.PublicKey) ([]chain.TradeRecord, error) {
	return nil, nil
}
func (f *fakeChain) GetAccountWithOwner(context.Context, solana.PublicKey) (*chain.AccountData, error) {
	return nil, nil
}
func (fakeRead) FetchTradeAdmissionsBySeries(context.Context, solana.PublicKey) ([]chain.TradeRecord, error) {
	return nil, nil
}
func (fakeRead) GetAccountWithOwner(context.Context, solana.PublicKey) (*chain.AccountData, error) {
	return nil, nil
}

var (
	fSwapReady   = solana.PublicKey{10: 1}
	fSwapWaiting = solana.PublicKey{10: 2}
	fSwapClosed  = solana.PublicKey{10: 3}
	fSwapUnknown = solana.PublicKey{10: 9}
	fEscrow      = solana.PublicKey{11: 1} // bond escrow of fSwapReady; the others get their own below
)

// tradeChain is fakeChain plus one series with admitted trades and their escrow token accounts.
type tradeChain struct {
	*fakeChain
	series *chain.Series // nil = no series at that mint
	trades []chain.TradeRecord
	tokens map[solana.PublicKey]*chain.TokenAccount // absent = the account does not exist
}

func (f *tradeChain) FetchSeries(context.Context, solana.PublicKey) (*chain.Series, error) {
	return f.series, nil
}
func (f *tradeChain) FetchTradeAdmissionsBySeries(_ context.Context, series solana.PublicKey) ([]chain.TradeRecord, error) {
	if series != fSeries {
		return nil, nil
	}
	return f.trades, nil
}
func (f *tradeChain) GetAccountWithOwner(context.Context, solana.PublicKey) (*chain.AccountData, error) {
	return &chain.AccountData{Owner: solana.TokenProgramID}, nil
}
func (f *tradeChain) FetchTokenAccount(_ context.Context, addr solana.PublicKey) (*chain.TokenAccount, error) {
	return f.tokens[addr], nil
}

func cashEscrowOf(t *testing.T, swapDvp solana.PublicKey) solana.PublicKey {
	t.Helper()
	ata, _, err := solana.FindAssociatedTokenAddressWithProgram(swapDvp, fCash, solana.TokenProgramID)
	if err != nil {
		t.Fatal(err)
	}
	return ata
}

// newTradeChain: three admitted trades of 5 bonds for 500,000 — both legs funded, bond leg only, and one whose
// cash escrow the DvP program already closed. seller/buyer default to fOwnerA/fOwnerB.
func newTradeChain(t *testing.T, seller, buyer solana.PublicKey) *tradeChain {
	t.Helper()
	series := fakeRead{}.series()
	series.OpenTrades = 3
	trade := func(swap, escrow solana.PublicKey, at int64) chain.TradeRecord {
		return chain.TradeRecord{Trade: &chain.TradeAdmission{
			Series: fSeries, SwapDvp: swap, Escrow: escrow, Seller: seller, Buyer: buyer,
			Units: 5, CashAmount: 500_000, AdmittedAt: at,
		}}
	}
	escrowWaiting, escrowClosed := solana.PublicKey{11: 2}, solana.PublicKey{11: 3}
	return &tradeChain{
		fakeChain: &fakeChain{},
		series:    series,
		trades: []chain.TradeRecord{
			trade(fSwapReady, fEscrow, 1_790_000_000),
			trade(fSwapWaiting, escrowWaiting, 1_790_000_060),
			trade(fSwapClosed, escrowClosed, 1_790_000_120),
		},
		tokens: map[solana.PublicKey]*chain.TokenAccount{
			fEscrow:                       {Amount: 5},
			cashEscrowOf(t, fSwapReady):   {Amount: 500_000},
			escrowWaiting:                 {Amount: 5},
			cashEscrowOf(t, fSwapWaiting): {Amount: 499_999},
			escrowClosed:                  {Amount: 0},
		},
	}
}

func TestTradeList(t *testing.T) {
	fc := newTradeChain(t, fOwnerA, fOwnerB)
	url, _, log, _, _ := demoServer(t, fc)

	var got struct {
		OpenTrades int        `json:"openTrades"`
		Items      []TradeDTO `json:"items"`
	}
	getJSON(t, url+"/series/"+fMint.String()+"/trades", http.StatusOK, &got)
	if got.OpenTrades != 3 || len(got.Items) != 3 {
		t.Fatalf("openTrades = %d, items = %d, want 3 and 3", got.OpenTrades, len(got.Items))
	}
	five, funded, short := "5", Amount{Minor: "500000", Display: "5000.00 tKZT", Currency: "tKZT"}, Amount{Minor: "499999", Display: "4999.99 tKZT", Currency: "tKZT"}
	base := TradeDTO{Seller: fOwnerA.String(), Buyer: fOwnerB.String(), Units: "5", CashAmount: funded}
	want := []TradeDTO{base, base, base}
	want[0].SwapDvp, want[0].Escrow, want[0].AdmittedAt = fSwapReady.String(), fEscrow.String(), "2026-09-21T19:13:20+05:00"
	want[0].FundedUnits, want[0].FundedCash, want[0].Status = &five, &funded, "ready"
	want[1].SwapDvp, want[1].Escrow, want[1].AdmittedAt = fSwapWaiting.String(), solana.PublicKey{11: 2}.String(), "2026-09-21T19:14:20+05:00"
	want[1].FundedUnits, want[1].FundedCash, want[1].Status = &five, &short, "awaiting_funding"
	zero := "0"
	want[2].SwapDvp, want[2].Escrow, want[2].AdmittedAt = fSwapClosed.String(), solana.PublicKey{11: 3}.String(), "2026-09-21T19:15:20+05:00"
	want[2].FundedUnits, want[2].FundedCash, want[2].Status = &zero, nil, "closed"
	for i := range want {
		if !reflect.DeepEqual(got.Items[i], want[i]) {
			t.Errorf("item %d:\n got %+v\nwant %+v", i, got.Items[i], want[i])
		}
	}

	// The wire shape the web codes against: null for a missing escrow, a number for openTrades.
	var raw struct {
		Items []map[string]any `json:"items"`
	}
	getJSON(t, url+"/series/"+fMint.String()+"/trades", http.StatusOK, &raw)
	if v, ok := raw.Items[2]["fundedCash"]; !ok || v != nil {
		t.Errorf("closed trade fundedCash = %v (present %v), want an explicit null", v, ok)
	}

	// The series DTO carries the counter too.
	var s map[string]any
	getJSON(t, url+"/series/"+fMint.String(), http.StatusOK, &s)
	if s["openTrades"] != float64(3) {
		t.Errorf("series openTrades = %v, want 3", s["openTrades"])
	}

	// No trades → an empty array, not null; an unknown mint → the series 404.
	fc.trades, fc.series.OpenTrades = nil, 0
	getJSON(t, url+"/series/"+fMint.String()+"/trades", http.StatusOK, &raw)
	if raw.Items == nil || len(raw.Items) != 0 {
		t.Errorf("items = %v, want []", raw.Items)
	}
	fc.series = nil
	getJSON(t, url+"/series/"+fMint.String()+"/trades", http.StatusNotFound, nil)

	if _, err := os.Stat(log); !os.IsNotExist(err) {
		t.Errorf("the read ran the CLI (log %v): it must read the chain only", err)
	}
}

func TestTradeStatus(t *testing.T) {
	adm := &chain.TradeAdmission{Units: 5, CashAmount: 500_000}
	acc := func(n uint64) *chain.TokenAccount { return &chain.TokenAccount{Amount: n} }
	tests := []struct {
		name       string
		bond, cash *chain.TokenAccount
		want       string
	}{
		{"both legs funded", acc(5), acc(500_000), "ready"},
		{"overfunded still ready", acc(6), acc(500_001), "ready"},
		{"nothing funded", acc(0), acc(0), "awaiting_funding"},
		{"cash short by one", acc(5), acc(499_999), "awaiting_funding"},
		{"bond short", acc(4), acc(500_000), "awaiting_funding"},
		{"bond escrow gone", nil, acc(500_000), "closed"},
		{"cash escrow gone", acc(5), nil, "closed"},
		{"both gone", nil, nil, "closed"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tradeStatus(adm, tt.bond, tt.cash); got != tt.want {
				t.Fatalf("tradeStatus = %q, want %q", got, tt.want)
			}
		})
	}
}

// tradeWrites is the fake CLI's answer to every trade:* command (bigints as strings, like the real CLI).
func tradeWrites(t *testing.T) {
	t.Helper()
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, t.TempDir(), "trade.json",
		`{"ok":true,"signature":"sig-trade","slot":"7","swapDvp":"`+fSwapReady.String()+`","returnedUnits":"5","forced":true}`))
}

func TestTradeRegistrarWrites(t *testing.T) {
	series := "/registrar/series/" + fMint.String() + "/trades"
	one := series + "/" + fSwapReady.String()
	createBody := `{"seller":"` + fOwnerA.String() + `","buyer":"` + fOwnerB.String() + `","units":5}`
	tests := []struct {
		name, path, body string
		wantArgv         string
		want             map[string]any
	}{
		{"create", series, createBody,
			"--json trade:create --series QPNb1 --seller " + fOwnerA.String() + " --buyer " + fOwnerB.String() + " --units 5",
			map[string]any{"signatures": []any{"sig-trade"}, "swapDvp": fSwapReady.String()}},
		{"settle", one + "/settle", "",
			"--json trade:settle --series QPNb1 --trade " + fSwapReady.String(),
			map[string]any{"signatures": []any{"sig-trade"}}},
		{"cancel without a body", one + "/cancel", "",
			"--json trade:cancel --series QPNb1 --trade " + fSwapReady.String(),
			map[string]any{"signatures": []any{"sig-trade"}, "returnedUnits": "5"}},
		{"forced cancel", one + "/cancel", `{"force":true}`,
			"--json trade:cancel --series QPNb1 --trade " + fSwapReady.String() + " --force",
			map[string]any{"signatures": []any{"sig-trade"}, "returnedUnits": "5"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url, st, log, demo, reg := demoServer(t, newTradeChain(t, fOwnerA, fOwnerB))
			tradeWrites(t)

			// Role matrix: no session 401, an investor session 403, neither reaches the CLI; the registrar runs it.
			if code, _ := postJSON(t, url, tt.path, tt.body, ""); code != http.StatusUnauthorized {
				t.Fatalf("no session: status %d, want 401", code)
			}
			if code, out := postJSON(t, url, tt.path, tt.body, demo); code != http.StatusForbidden || out["code"] != "forbidden" {
				t.Fatalf("investor session: %d %v, want 403 forbidden", code, out)
			}
			if got := cliLines(t, log); got != nil {
				t.Fatalf("refused requests ran the CLI: %q", got)
			}
			code, out := postJSON(t, url, tt.path, tt.body, reg)
			if code != http.StatusOK || !reflect.DeepEqual(out, tt.want) {
				t.Fatalf("registrar: %d %v, want 200 %v", code, out, tt.want)
			}
			if got := cliLines(t, log); len(got) != 1 || got[0] != tt.wantArgv {
				t.Fatalf("cli log = %q, want %q", got, tt.wantArgv)
			}
			rows, err := st.ListAudit(t.Context(), 10)
			if err != nil || len(rows) != 1 {
				t.Fatalf("audit rows = %d (err %v), want the one write", len(rows), err)
			}
			if r := rows[0]; !r.OK || r.Role != "registrar" || r.Route != "POST "+tt.path || !reflect.DeepEqual(r.Signatures, []string{"sig-trade"}) {
				t.Fatalf("audit row = %+v, want ok registrar %s with the signature", r, tt.path)
			}
		})
	}
}

func TestTradeWriteErrors(t *testing.T) {
	url, st, log, demo, reg := demoServer(t, newTradeChain(t, fOwnerA, fOwnerB))
	tradeWrites(t)
	for _, name := range demoInvestorEnv {
		t.Setenv(name, "") // hermetic: no demo investor keypair is configured in this test
	}
	series := "/registrar/series/" + fMint.String() + "/trades"
	other := "/registrar/series/" + solana.PublicKey{9: 9}.String() + "/trades" // a mint the CLI config does not know
	fund := func(swap solana.PublicKey) string {
		return "/demo/investor/series/" + fMint.String() + "/trades/" + swap.String() + "/fund"
	}
	pair := `"seller":"` + fOwnerA.String() + `","buyer":"` + fOwnerB.String() + `"`
	tests := []struct {
		name, path, body, token string
		wantStatus              int
		wantCode                string
	}{
		{"create: not JSON", series, `nope`, reg, 400, "invalid_body"},
		{"create: zero units", series, `{` + pair + `,"units":0}`, reg, 400, "invalid_body"},
		{"create: fractional units", series, `{` + pair + `,"units":1.5}`, reg, 400, "invalid_body"},
		{"create: negative units", series, `{` + pair + `,"units":-5}`, reg, 400, "invalid_body"},
		{"create: bad seller", series, `{"seller":"x","buyer":"` + fOwnerB.String() + `","units":5}`, reg, 400, "invalid_body"},
		{"create: seller is the buyer", series, `{"seller":"` + fOwnerA.String() + `","buyer":"` + fOwnerA.String() + `","units":5}`, reg, 400, "invalid_body"},
		{"create: unknown series", other, `{` + pair + `,"units":5}`, reg, 404, "unknown_series"},
		{"settle: unknown series", other + "/" + fSwapReady.String() + "/settle", "", reg, 404, "unknown_series"},
		{"settle: trade not admitted", series + "/" + fSwapUnknown.String() + "/settle", "", reg, 404, "trade_not_found"},
		{"cancel: trade not admitted", series + "/" + fSwapUnknown.String() + "/cancel", `{"force":true}`, reg, 404, "trade_not_found"},
		{"cancel: body is not an object", series + "/" + fSwapReady.String() + "/cancel", `[1]`, reg, 400, "invalid_body"},
		{"fund: bad side", fund(fSwapReady), `{"side":"both"}`, demo, 400, "invalid_body"},
		{"fund: no body", fund(fSwapReady), ``, demo, 400, "invalid_body"},
		{"fund: trade not admitted", fund(fSwapUnknown), `{"side":"seller"}`, demo, 404, "trade_not_found"},
		{"fund: party is not a demo investor", fund(fSwapReady), `{"side":"buyer"}`, demo, 403, "not_demo_investor"},
		{"fund: registrar session passes the role gate", fund(fSwapReady), `{"side":"seller"}`, reg, 403, "not_demo_investor"},
		{"fund: no session", fund(fSwapReady), `{"side":"seller"}`, "", 401, "unauthenticated"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code, out := postJSON(t, url, tt.path, tt.body, tt.token)
			if code != tt.wantStatus || out["code"] != tt.wantCode {
				t.Fatalf("%d %v, want %d %s", code, out, tt.wantStatus, tt.wantCode)
			}
		})
	}
	if got := cliLines(t, log); got != nil {
		t.Fatalf("a refused request ran the CLI: %q", got)
	}

	// The chain says no: 409 with the CLI's message, and a failed audit row.
	t.Setenv("FAKE_CLI_EXIT", "1")
	t.Setenv("FAKE_CLI_STDOUT", "")
	t.Setenv("FAKE_CLI_STDERR", writeT(t, t.TempDir(), "err.txt", "Error: TradeStillOpen"))
	code, out := postJSON(t, url, series+"/"+fSwapReady.String()+"/settle", "", reg)
	if code != http.StatusConflict || out["code"] != "onchain" || !strings.Contains(out["onchainError"].(string), "TradeStillOpen") {
		t.Fatalf("on-chain refusal: %d %v, want 409 onchain TradeStillOpen", code, out)
	}
	rows, err := st.ListAudit(t.Context(), 10)
	if err != nil || len(rows) != 1 || rows[0].OK {
		t.Fatalf("audit = %+v (err %v), want one failed row", rows, err)
	}
}

func TestTradeFundDemo(t *testing.T) {
	// A throwaway investor key in the solana-keygen file format (JSON array of 64 bytes), made for this test.
	key, err := solana.NewRandomPrivateKey()
	if err != nil {
		t.Fatal(err)
	}
	nums := make([]int, len(key))
	for i, b := range key {
		nums[i] = int(b)
	}
	file, _ := json.Marshal(nums)
	path := filepath.Join(t.TempDir(), "investor2.json")
	if err := os.WriteFile(path, file, 0o600); err != nil {
		t.Fatal(err)
	}

	// The demo investor sells to fOwnerB, whose key the server does not hold.
	url, st, log, demo, _ := demoServer(t, newTradeChain(t, key.PublicKey(), fOwnerB))
	tradeWrites(t)
	for _, name := range demoInvestorEnv {
		t.Setenv(name, "")
	}
	t.Setenv("QUPON_INVESTOR1_KEYPAIR", filepath.Join(t.TempDir(), "missing.json")) // unreadable: skipped, not fatal
	t.Setenv("QUPON_INVESTOR2_KEYPAIR", path)

	fund := "/demo/investor/series/" + fMint.String() + "/trades/" + fSwapReady.String() + "/fund"
	code, out := postJSON(t, url, fund, `{"side":"seller"}`, demo)
	if code != http.StatusOK || out["demo"] != true || out["ok"] != true || out["signature"] != "sig-trade" || out["explorerUrl"] == nil {
		t.Fatalf("fund = %d %v, want the runDemo shape", code, out)
	}
	want := "--json trade:fund --series QPNb1 --trade " + fSwapReady.String() + " --side seller --keypair " + path
	if got := cliLines(t, log); len(got) != 1 || got[0] != want {
		t.Fatalf("cli log = %q, want %q", got, want)
	}
	if code, out := postJSON(t, url, fund, `{"side":"buyer"}`, demo); code != http.StatusForbidden || out["code"] != "not_demo_investor" {
		t.Fatalf("buyer leg = %d %v, want 403 not_demo_investor", code, out)
	}
	rows, err := st.ListAudit(t.Context(), 10)
	if err != nil || len(rows) != 1 || !rows[0].OK || strings.Contains(string(rows[0].Params), path) {
		t.Fatalf("audit = %+v (err %v), want one ok row that does not name the keypair file", rows, err)
	}
}

// The record date waits for the operator: with a trade admitted, advancing an Announced action runs nothing.
func TestAdvanceWaitsForOpenTrades(t *testing.T) {
	fc := newTradeChain(t, fOwnerA, fOwnerB)
	fc.action = &chain.CorporateAction{Series: fSeries, Index: 1, Status: 0}
	url, _, log, _, reg := demoServer(t, fc)

	path := "/registrar/actions/" + fAction.String() + "/advance"
	code, out := postJSON(t, url, path, `{"confirm":true}`, reg)
	if want := "open secondary trades: settle or cancel them first (3)"; code != http.StatusBadRequest || out["message"] != want {
		t.Fatalf("advance = %d %v, want 400 %q", code, out, want)
	}
	if got := cliLines(t, log); got != nil {
		t.Fatalf("advance ran the CLI with trades open: %q", got)
	}

	fc.series.OpenTrades = 0
	if code, out := postJSON(t, url, path, `{"confirm":true}`, reg); code != http.StatusOK || out["step"] != "strike_record" {
		t.Fatalf("advance without open trades = %d %v, want the strike", code, out)
	}
}
