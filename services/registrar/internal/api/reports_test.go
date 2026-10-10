package api

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

func reportsServer(t *testing.T) (http.Handler, *store.Store, *auth.Service) {
	t.Helper()
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "reports.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(50, time.Minute)}
	return New(slog.New(slog.DiscardHandler), st, Deps{Read: fakeRead{}, Auth: svc}), st, svc
}

func linkWallet(t *testing.T, st *store.Store, email, addr string) {
	t.Helper()
	u, _, err := st.UserByEmail(t.Context(), email)
	if err != nil {
		t.Fatal(err)
	}
	if err := st.CreateWalletChallenge(t.Context(), store.WalletChallenge{Nonce: "n" + addr, UserID: u.ID, Address: addr, ExpiresAt: time.Now().Add(time.Hour).Unix()}); err != nil {
		t.Fatal(err)
	}
	if err := st.LinkWallet(t.Context(), "n"+addr, store.Wallet{Address: addr, UserID: u.ID, VerifiedAt: 1}); err != nil {
		t.Fatal(err)
	}
}

func getReport(t *testing.T, h http.Handler, path, token string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec, out
}

func TestInvestorStatementAndTax(t *testing.T) {
	h, st, svc := reportsServer(t)
	inv := signIn(t, h, st, svc, "investor")
	linkWallet(t, st, "investor@test.kz", fOwnerB.String())
	other := signIn(t, h, st, svc, "issuer") // no wallets

	rec, out := getReport(t, h, "/me/reports/statement", inv)
	ps, _ := out["payouts"].([]any)
	if rec.Code != 200 || len(ps) != 1 {
		t.Fatalf("statement: %d %v", rec.Code, out)
	}
	p := ps[0].(map[string]any)
	if p["owner"] != fOwnerB.String() || p["gross"].(float64) != 125_000 || p["status"] != "Paid" || p["series"] != "QPNb1" {
		t.Fatalf("payout row = %v", p)
	}
	if _, out := getReport(t, h, "/me/reports/statement", other); len(out["payouts"].([]any)) != 0 {
		t.Fatalf("a user without wallets sees payouts: %v", out)
	}
	if _, out := getReport(t, h, "/me/reports/statement?from=2027-02-01", inv); len(out["payouts"].([]any)) != 0 {
		t.Fatalf("date filter ignored: %v", out)
	}

	_, out = getReport(t, h, "/me/reports/tax?year=2027", inv)
	tot := out["totals"].([]any)
	if len(out["payouts"].([]any)) != 1 || tot[0].(map[string]any)["gross"] != "1250.00" {
		t.Fatalf("tax 2027 = %v", out)
	}
	if _, out := getReport(t, h, "/me/reports/tax?year=2026", inv); len(out["payouts"].([]any)) != 0 {
		t.Fatalf("tax 2026 = %v", out)
	}
	if rec, _ := getReport(t, h, "/me/reports/tax?year=x", inv); rec.Code != 400 {
		t.Fatalf("bad year: %d", rec.Code)
	}

	rec, _ = getReport(t, h, "/me/reports/statement?format=csv", inv)
	body := rec.Body.String()
	if !strings.HasPrefix(body, "\ufeffpayment_date,") || !strings.Contains(body, ",1250.00,") ||
		!strings.Contains(rec.Header().Get("Content-Disposition"), "qupon-statement.csv") ||
		!strings.Contains(body, "# network,devnet") || !strings.Contains(body, "# source,"+fOwnerB.String()) {
		t.Fatalf("csv: %q %v", body, rec.Header())
	}
}

func TestRegistrarHoldersAndIssuerPayouts(t *testing.T) {
	h, st, svc := reportsServer(t)
	reg := signIn(t, h, st, svc, "registrar")
	iss := signIn(t, h, st, svc, "issuer")
	inv := signIn(t, h, st, svc, "investor")

	rec, out := getReport(t, h, "/registrar/reports/holders/"+fMint.String(), reg)
	hs, _ := out["holders"].([]any)
	if rec.Code != 200 || len(hs) != 1 || hs[0].(map[string]any)["units"].(float64) != 10 {
		t.Fatalf("holders: %d %v", rec.Code, out)
	}
	if rec, _ := getReport(t, h, "/registrar/reports/holders/"+fMint.String(), inv); rec.Code != http.StatusForbidden {
		t.Fatalf("investor read the register: %d", rec.Code)
	}

	rec, out = getReport(t, h, "/issuer/reports/payouts/"+fAction.String(), iss)
	ps, _ := out["payouts"].([]any)
	tot := out["totals"].([]any)[0].(map[string]any)
	if rec.Code != 200 || len(ps) != 2 || tot["gross"] != "1750.00" {
		t.Fatalf("payouts: %d %v", rec.Code, out)
	}
	if rec, _ := getReport(t, h, "/issuer/reports/payouts/"+fAction.String(), inv); rec.Code != http.StatusForbidden {
		t.Fatalf("investor read payouts: %d", rec.Code)
	}
}

// Plan 15 (task 91544): the statement tells the bank-route story — the escrow→agent tx, and once the paying
// agent confirms the SIMULATED transfer, the confirmation tx and reference hash — while the issuer report
// adds required vs funded, the default/cure stamps and the bank payout counts. Everything is read back
// from stored activity rows exactly as the poller ingests them.
func TestBankRouteStatementAndIssuerSummary(t *testing.T) {
	h, st, svc := reportsServer(t)
	inv := signIn(t, h, st, svc, "investor")
	iss := signIn(t, h, st, svc, "issuer")
	linkWallet(t, st, "investor@test.kz", fOwnerB.String())

	apda := fAction.String()
	ins := func(kind, sig, payload string, ts int64) {
		t.Helper()
		if _, err := st.InsertActivity(t.Context(), store.Activity{Ts: ts, ActionPDA: &apda, Kind: kind,
			Payload: json.RawMessage(payload), Sig: sig}); err != nil {
			t.Fatal(err)
		}
	}
	ref := make([]byte, 32)
	ref[0], ref[1] = 0xAB, 0xCD
	ins("ActionFunded", "fundTx", `{"required":"500000","escrow_balance":"500000","fully_funded":true}`, tsCoupon)
	ins("ActionDefaulted", "defaultTx", `{"required":"500000","defaulted_at":`+strconv.FormatInt(tsCoupon+7200, 10)+`}`, tsCoupon+7200)
	ins("DefaultCured", "cureTx", `{"late_secs":1800}`, tsCoupon+9000)
	ins("PaidToAgent", "agentTx", `{"owner":"`+fOwnerB.String()+`"}`, tsCoupon+9600)
	ins("BankPayoutConfirmed", "confirmTx",
		`{"owner":"`+fOwnerB.String()+`","reference_hash":"`+base64.StdEncoding.EncodeToString(ref)+`"}`, tsCoupon+9900)
	ins("PaidToAgent", "agentTx2", `{"owner":"`+fOwnerA.String()+`"}`, tsCoupon+9700) // awaiting confirmation

	rec, out := getReport(t, h, "/me/reports/statement", inv)
	p := out["payouts"].([]any)[0].(map[string]any)
	if rec.Code != 200 || p["route"] != "bank" || p["bankPayoutTx"] != "agentTx" ||
		p["bankConfirmationTx"] != "confirmTx" || p["bankRefHash"] != hex.EncodeToString(ref) {
		t.Fatalf("bank row = %v", p)
	}

	rec, _ = getReport(t, h, "/me/reports/statement?format=csv", inv)
	if body := rec.Body.String(); !strings.Contains(body, ",bank,") || !strings.Contains(body, ",confirmTx,") {
		t.Fatalf("csv route/confirmation columns: %q", body)
	}

	_, out = getReport(t, h, "/issuer/reports/payouts/"+fAction.String(), iss)
	sum, _ := out["action"].(map[string]any)
	if sum == nil {
		t.Fatalf("no action summary: %v", out)
	}
	req, _ := sum["required"].(map[string]any)
	if req["minor"] != "500000" || sum["lateSeconds"].(float64) != 1800 ||
		sum["bankConfirmed"].(float64) != 1 || sum["bankPending"].(float64) != 1 ||
		sum["defaultedAt"] != time.Unix(tsCoupon+7200, 0).In(almaty).Format(time.RFC3339) ||
		sum["curedAt"] != time.Unix(tsCoupon+9000, 0).In(almaty).Format(time.RFC3339) {
		t.Fatalf("action summary = %v", sum)
	}
}
