package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/qupon-kz/qupon/services/registrar/internal/network"
)

func TestMainnetGuard(t *testing.T) {
	main, _ := network.New("mainnet-beta", "P")
	dev, _ := network.New("devnet", "P")
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) })
	cases := []struct {
		p            network.Profile
		method, path string
		confirm      string
		want         int
		code         string
	}{
		{dev, "POST", "/issuer/series", "", http.StatusTeapot, ""},
		{dev, "POST", "/auth/demo", "", http.StatusTeapot, ""},
		{main, "GET", "/series", "", http.StatusTeapot, ""},
		{main, "POST", "/auth/demo", "", http.StatusForbidden, "demo_disabled"},
		{main, "POST", "/demo/investor/vote", "", http.StatusForbidden, "demo_disabled"},
		{main, "POST", "/issuer/series", "", http.StatusPreconditionRequired, "confirmation_required"},
		{main, "PATCH", "/admin/assets/M", "devnet", http.StatusPreconditionRequired, "confirmation_required"},
		{main, "POST", "/registrar/actions/A/advance", "mainnet-beta", http.StatusTeapot, ""},
		{main, "POST", "/auth/login", "", http.StatusTeapot, ""},
		{main, "POST", "/me/wallets", "", http.StatusTeapot, ""},
	}
	for _, c := range cases {
		req := httptest.NewRequest(c.method, c.path, strings.NewReader("{}"))
		if c.confirm != "" {
			req.Header.Set(ConfirmHeader, c.confirm)
		}
		rec := httptest.NewRecorder()
		mainnetGuard(c.p)(ok).ServeHTTP(rec, req)
		if rec.Code != c.want || (c.code != "" && !strings.Contains(rec.Body.String(), c.code)) {
			t.Errorf("%s %s %s on %s: %d %s", c.method, c.path, c.confirm, c.p.Name, rec.Code, rec.Body)
		}
	}
}

func TestReadinessWithoutChain(t *testing.T) {
	h, svc, st := newAuthServer(t, true)
	tok := signIn(t, h, st, svc, "admin")
	req := httptest.NewRequest("GET", "/admin/network/readiness", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	body := rec.Body.String()
	if rec.Code != 200 || !strings.Contains(body, `"key":"rpc_reachable","ok":false`) ||
		!strings.Contains(body, `"key":"cash_assets_enabled","ok":false`) {
		t.Fatalf("readiness: %d %s", rec.Code, body)
	}
	if code := doGet(t, h, "/admin/network/readiness", signIn(t, h, st, svc, "issuer")); code != http.StatusForbidden {
		t.Fatalf("issuer readiness: %d", code)
	}
}
