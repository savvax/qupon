package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
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
