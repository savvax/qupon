package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/kase"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// kaseUpstream serves the captured kase.kz bodies (task 600 fixtures) under
// their real paths; failing flips every answer to 500.
func kaseUpstream(t *testing.T, failing *atomic.Bool) *httptest.Server {
	t.Helper()
	files := map[string]string{
		"/api/instruments/bonds/TEBNb10/":                 "bond_TEBNb10.json",
		"/api/instruments/bonds/TEBNb10/characteristics/": "characteristics_TEBNb10.json",
		"/api/instruments/coupon-payments/TEBNb10/":       "coupon_payments_TEBNb10.json",
		"/api/instruments/trade-info/TEBNb10/":            "trade_info_TEBNb10.json",
		"/api/instruments/last-deals/TEBNb10/":            "last_deals_TEBNb10.json",
		"/api/news/company/ASBN/":                         "@news", // language comes from ?language=
	}
	mux := http.NewServeMux()
	for path := range files {
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			if failing.Load() {
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			name := files[r.URL.Path] // ServeMux patterns never contain the query string
			if name == "@news" {
				name = "news_ASBN_" + r.URL.Query().Get("language") + ".json"
			}
			if name == "" {
				http.NotFound(w, r)
				return
			}
			body, err := os.ReadFile(filepath.Join("..", "kase", "testdata", name))
			if err != nil {
				t.Errorf("fixture %s: %v", name, err)
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write(body)
		})
	}
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// newKaseServer builds the API with a kase service pointed at the fixture
// upstream. The clock is controllable so tests can age the cache past its TTLs.
func newKaseServer(t *testing.T, upstream string) (http.Handler, *time.Time, *store.Store) {
	t.Helper()
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "kase.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	clock := time.Unix(1760000000, 0)
	h := New(slog.New(slog.DiscardHandler), st, Deps{Kase: &kase.Service{
		Client: &kase.Client{Base: upstream},
		Store:  st,
		Now:    func() time.Time { return clock },
	}})
	return h, &clock, st
}

func kaseAPI(t *testing.T, upstream string) *httptest.Server {
	t.Helper()
	h, _, _ := newKaseServer(t, upstream)
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return srv
}

func TestKaseBondEndpoint(t *testing.T) {
	srv := kaseAPI(t, kaseUpstream(t, new(atomic.Bool)).URL)

	var bond kase.Bond
	getJSON(t, srv.URL+"/kase/bonds/TEBNb10", http.StatusOK, &bond)
	if bond.Ticker != "TEBNb10" || bond.ISIN != "KZ2C00000065" || bond.Issuer != "ForteBank" {
		t.Errorf("bond = %s/%s/%s", bond.Ticker, bond.ISIN, bond.Issuer)
	}
	if bond.Currency != "KZT" || bond.Face != 1 || bond.CouponRate != 800 || bond.Frequency != 2 {
		t.Errorf("terms = %s %d %d %d", bond.Currency, bond.Face, bond.CouponRate, bond.Frequency)
	}
	if bond.IssueDate != "2006-11-29" || bond.MaturityDate != "2026-11-29" {
		t.Errorf("dates = %s..%s", bond.IssueDate, bond.MaturityDate)
	}
	if len(bond.Schedule) == 0 || bond.Schedule[0].Rate != 850 {
		t.Errorf("schedule = %+v…", bond.Schedule[:min(2, len(bond.Schedule))])
	}
	if bond.Market.Price == nil || *bond.Market.Price != 67.52 {
		t.Errorf("market = %+v", bond.Market)
	}
	if bond.Stale || bond.FetchedAt == "" {
		t.Errorf("stale/fetchedAt = %v/%s", bond.Stale, bond.FetchedAt)
	}
}

func TestKaseBondInvalidTicker(t *testing.T) {
	srv := kaseAPI(t, kaseUpstream(t, new(atomic.Bool)).URL)

	for _, tc := range []struct{ name, ticker string }{
		{"path traversal", "../x"}, {"too short", "a"}, {"space", "TE BN"}, {"too long", "toolongticker123"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			// The Go client sends the raw path; chi exposes ".." as a segment and
			// the handler rejects it (spec §6: only ^[A-Za-z0-9]{2,12}$ reaches a URL).
			req, _ := http.NewRequest(http.MethodGet, srv.URL+"/kase/bonds/"+tc.ticker, nil)
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatalf("ticker %q: %v", tc.ticker, err)
			}
			defer func() { _ = resp.Body.Close() }()
			var out struct {
				Code string `json:"code"`
			}
			_ = decodeBody(resp, &out)
			if resp.StatusCode != http.StatusBadRequest {
				t.Errorf("ticker %q status = %d, want 400", tc.ticker, resp.StatusCode)
			}
			if out.Code != "invalid_ticker" {
				t.Errorf("ticker %q code = %q, want invalid_ticker", tc.ticker, out.Code)
			}
		})
	}
}

func decodeBody(resp *http.Response, into any) error {
	return json.NewDecoder(resp.Body).Decode(into)
}

func TestKaseBondHTMLEnvironment(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte("<html>kase.kz maintenance</html>"))
	}))
	t.Cleanup(up.Close)
	srv := kaseAPI(t, up.URL)

	var out struct {
		Code string `json:"code"`
	}
	getJSON(t, srv.URL+"/kase/bonds/TEBNb10", http.StatusBadGateway, &out)
	if out.Code != "kase_unavailable" {
		t.Errorf("code = %q, want kase_unavailable", out.Code)
	}
}

// Review focus: kase.kz answers 500 after one good response → the cached body
// is served with stale: true; no page breaks.
func TestKaseBondStaleAfterFailure(t *testing.T) {
	failing := new(atomic.Bool)
	up := kaseUpstream(t, failing)
	h, clock, _ := newKaseServer(t, up.URL)
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)

	var fresh kase.Bond
	getJSON(t, srv.URL+"/kase/bonds/TEBNb10", http.StatusOK, &fresh)
	if fresh.Stale {
		t.Fatal("first fetch should be fresh")
	}
	*clock = clock.Add(kase.TTLReference + time.Minute)
	failing.Store(true)

	var stale kase.Bond
	getJSON(t, srv.URL+"/kase/bonds/TEBNb10", http.StatusOK, &stale)
	if !stale.Stale || stale.Ticker != "TEBNb10" || stale.CouponRate != fresh.CouponRate {
		t.Errorf("stale bond = %+v (want the cached TEBNb10 body, stale)", stale)
	}
	if len(stale.Schedule) != len(fresh.Schedule) {
		t.Errorf("stale schedule = %d entries, want %d", len(stale.Schedule), len(fresh.Schedule))
	}
}

func TestKaseBondNotFoundUpstream(t *testing.T) {
	srv := kaseAPI(t, kaseUpstream(t, new(atomic.Bool)).URL)

	var out struct {
		Code string `json:"code"`
	}
	getJSON(t, srv.URL+"/kase/bonds/NOPEb1", http.StatusNotFound, &out)
	if out.Code != "kase_not_found" {
		t.Errorf("code = %q, want kase_not_found", out.Code)
	}
}

func TestKaseNewsEndpoint(t *testing.T) {
	srv := kaseAPI(t, kaseUpstream(t, new(atomic.Bool)).URL)

	var news kase.News
	getJSON(t, srv.URL+"/kase/news/ASBN?lang=ru", http.StatusOK, &news)
	if news.Issuer != "ASBN" || news.Lang != "ru" || len(news.Items) == 0 {
		t.Errorf("news = %s/%s %d items", news.Issuer, news.Lang, len(news.Items))
	}
	if news.Items[0].Language != "ru" || news.Items[0].Subject == "" {
		t.Errorf("first item = %+v", news.Items[0])
	}

	getJSON(t, srv.URL+"/kase/news/ASBN", http.StatusOK, &news) // lang defaults to ru
	if news.Lang != "ru" {
		t.Errorf("default lang = %s, want ru", news.Lang)
	}
	getJSON(t, srv.URL+"/kase/news/ASBN?lang=fr", http.StatusBadRequest, nil)
}

// GET /kase/series/{mint} is the series→ticker link the bond page's KASE panel needs.
func TestKaseSeriesTickerLink(t *testing.T) {
	h, _, st := newKaseServer(t, kaseUpstream(t, new(atomic.Bool)).URL)
	linked := "QpNb1Dem0BondMint1111111111111111111111111111"
	unlinked := "BTRKDeM0BondMint1111111111111111111111111111"
	if err := st.UpsertSeriesSettings(t.Context(), store.SeriesSettings{SeriesMint: linked, KaseTicker: "TEBNb10"}); err != nil {
		t.Fatalf("seed settings: %v", err)
	}
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)

	for _, tc := range []struct {
		name, mint, wantTicker string
		status                 int
		code                   string
	}{
		{"linked series", linked, "TEBNb10", http.StatusOK, ""},
		{"no settings row", unlinked, "", http.StatusNotFound, "no_kase_ticker"},
		{"not a mint", "TEBNb10", "", http.StatusBadRequest, "invalid_mint"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var out struct {
				Ticker string `json:"ticker"`
				Code   string `json:"code"`
			}
			getJSON(t, srv.URL+"/kase/series/"+tc.mint, tc.status, &out)
			if out.Ticker != tc.wantTicker || out.Code != tc.code {
				t.Errorf("out = %+v, want ticker %q code %q", out, tc.wantTicker, tc.code)
			}
		})
	}
}

func TestKaseNotConfigured(t *testing.T) {
	handler, _ := newTestServer(t) // Deps{}: no kase service
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	var out struct {
		Code string `json:"code"`
	}
	getJSON(t, srv.URL+"/kase/bonds/TEBNb10", http.StatusServiceUnavailable, &out)
	if out.Code != "kase_unavailable" {
		t.Errorf("code = %q, want kase_unavailable", out.Code)
	}
}
