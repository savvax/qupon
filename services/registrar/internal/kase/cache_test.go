package kase

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// fixtureServer serves the captured kase.kz bodies under their real paths; when
// failing is true every request answers 500 (review focus: kase.kz down).
func fixtureServer(t *testing.T, failing *atomic.Bool) *httptest.Server {
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
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write(fixture(t, name))
		})
	}
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// memCache is an in-memory CacheStore for the package tests.
type memCache struct {
	m map[string]memEntry
}

type memEntry struct {
	body string
	at   int64
}

func (m *memCache) GetKaseCache(_ context.Context, key string) (string, int64, bool, error) {
	if e, ok := m.m[key]; ok {
		return e.body, e.at, true, nil
	}
	return "", 0, false, nil
}

func (m *memCache) PutKaseCache(_ context.Context, key, body string, at int64) error {
	if m.m == nil {
		m.m = map[string]memEntry{}
	}
	m.m[key] = memEntry{body: body, at: at}
	return nil
}

func newTestService(upstream string) (*Service, *memCache, *time.Time) {
	clock := time.Unix(1760000000, 0) // fixed start; tests advance it past the TTLs
	s := &Service{
		Client: &Client{Base: upstream},
		Store:  &memCache{},
		Now: func() time.Time {
			return clock
		},
	}
	return s, s.Store.(*memCache), &clock
}

func TestServiceBondNormalisesFixtures(t *testing.T) {
	s, _, _ := newTestService(fixtureServer(t, &atomic.Bool{}).URL)
	out, err := s.Bond(t.Context(), "TEBNb10")
	if err != nil {
		t.Fatalf("bond: %v", err)
	}
	if out.Ticker != "TEBNb10" || out.CouponRate != 800 || len(out.Schedule) == 0 {
		t.Errorf("bond = %+v", out)
	}
	if out.Stale || out.FetchedAt == "" {
		t.Errorf("stale/fetchedAt = %v/%s, want false/set", out.Stale, out.FetchedAt)
	}
}

func TestServiceBondCacheHitAvoidsRefetch(t *testing.T) {
	var hits atomic.Int64
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/instruments/bonds/TEBNb10/" {
			http.NotFound(w, r) // the enrichment endpoints are simply absent here
			return
		}
		hits.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(fixture(t, "bond_TEBNb10.json"))
	}))
	defer up.Close()

	s, _, _ := newTestService(up.URL)
	for range 2 {
		if _, err := s.Bond(t.Context(), "TEBNb10"); err != nil {
			t.Fatalf("bond: %v", err)
		}
	}
	if n := hits.Load(); n != 1 {
		t.Errorf("upstream bond hits = %d, want 1 (second call served from cache within TTL)", n)
	}
}

// Review focus: kase.kz answers 5xx after one good response → the cached body
// is served with stale: true.
func TestServiceBondServesStaleOnFailure(t *testing.T) {
	failing := &atomic.Bool{}
	s, _, clock := newTestService(fixtureServer(t, failing).URL)
	first, err := s.Bond(t.Context(), "TEBNb10")
	if err != nil {
		t.Fatalf("first bond: %v", err)
	}
	*clock = clock.Add(TTLReference + time.Minute) // every part is now expired
	failing.Store(true)
	second, err := s.Bond(t.Context(), "TEBNb10")
	if err != nil {
		t.Fatalf("second bond: %v", err)
	}
	if !second.Stale {
		t.Error("second bond should be marked stale")
	}
	if second.Ticker != first.Ticker || second.CouponRate != first.CouponRate || len(second.Schedule) != len(first.Schedule) {
		t.Errorf("stale body differs: %+v vs %+v", second, first)
	}
}

func TestServiceBondUnavailableWithoutCache(t *testing.T) {
	failing := new(atomic.Bool)
	failing.Store(true)
	s, _, _ := newTestService(fixtureServer(t, failing).URL)
	if _, err := s.Bond(t.Context(), "TEBNb10"); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("err = %v, want ErrUnavailable", err)
	}
}

func TestServiceBondNotFound(t *testing.T) {
	s, _, _ := newTestService(fixtureServer(t, &atomic.Bool{}).URL)
	if _, err := s.Bond(t.Context(), "NOPEb1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
	if _, err := s.Bond(t.Context(), "../x"); !errors.Is(err, ErrInvalidCode) {
		t.Fatalf("err = %v, want ErrInvalidCode", err)
	}
}

func TestServiceNews(t *testing.T) {
	s, _, _ := newTestService(fixtureServer(t, &atomic.Bool{}).URL)
	out, err := s.News(t.Context(), "ASBN", "ru")
	if err != nil {
		t.Fatalf("news: %v", err)
	}
	if out.Issuer != "ASBN" || out.Lang != "ru" || len(out.Items) == 0 {
		t.Errorf("news = %+v", out)
	}
	if out.Stale {
		t.Error("fresh news should not be stale")
	}
}
