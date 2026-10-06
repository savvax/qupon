package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/network"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

func TestNetworkEndpoint(t *testing.T) {
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "n.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, DemoLogin: true, Limit: auth.NewLimiter(5, time.Minute)}
	main, _ := network.New("mainnet-beta", "QPN1")
	cases := []struct {
		deps               Deps
		network            string
		mainnet, demoLogin bool
	}{
		{Deps{Auth: svc}, "devnet", false, true}, // zero profile = devnet
		{Deps{Auth: svc, Network: main}, "mainnet-beta", true, false},
		{Deps{}, "devnet", false, false},
	}
	for _, c := range cases {
		rec := httptest.NewRecorder()
		New(slog.New(slog.DiscardHandler), st, c.deps).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/network", nil))
		var got struct {
			Network   string `json:"network"`
			Mainnet   bool   `json:"mainnet"`
			DemoLogin bool   `json:"demoLogin"`
		}
		if rec.Code != http.StatusOK || json.Unmarshal(rec.Body.Bytes(), &got) != nil {
			t.Fatalf("status %d body %s", rec.Code, rec.Body)
		}
		if got.Network != c.network || got.Mainnet != c.mainnet || got.DemoLogin != c.demoLogin {
			t.Fatalf("got %+v, want %s mainnet=%v demo=%v", got, c.network, c.mainnet, c.demoLogin)
		}
	}
}

func TestSeriesListDropsHidden(t *testing.T) {
	h, st := newTestServer(t)
	for _, m := range []string{"Visible1", "Hidden1"} {
		if err := st.UpsertSeries(t.Context(), m, []byte(`{"mint":"`+m+`"}`)); err != nil {
			t.Fatal(err)
		}
	}
	if err := st.HideSeriesIfUnset(t.Context(), "Hidden1"); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/series", nil))
	var got []struct{ Mint string }
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || len(got) != 1 || got[0].Mint != "Visible1" {
		t.Fatalf("series = %s (%v)", rec.Body, err)
	}
}

func TestRequireUserAdmitsEveryRole(t *testing.T) {
	h, svc, st := newAuthServer(t, false)
	for _, role := range []string{"issuer", "registrar", "investor", "admin"} {
		tok := signIn(t, h, st, svc, role)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.Header.Set("Authorization", "Bearer "+tok)
		requireUser(svc)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })).ServeHTTP(rec, req)
		if rec.Code != 204 {
			t.Fatalf("%s: status %d", role, rec.Code)
		}
	}
	rec := httptest.NewRecorder()
	requireUser(svc)(http.NotFoundHandler()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/x", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d", rec.Code)
	}
}
