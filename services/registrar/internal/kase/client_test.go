package kase

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestValidCode(t *testing.T) {
	for s, want := range map[string]bool{
		"TEBNb10": true, "ASBN": true, "a": false, "": false,
		"tooltongticker12": false, "../x": false, "TE BN": false, "TE-BN": false,
	} {
		if got := ValidCode(s); got != want {
			t.Errorf("ValidCode(%q) = %v, want %v", s, got, want)
		}
	}
}

func TestClientPathsUserAgentAndTrailingSlash(t *testing.T) {
	var mu sync.Mutex
	seen := map[string]string{} // path -> User-Agent
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		mu.Lock()
		seen[r.URL.RequestURI()] = r.Header.Get("User-Agent")
		mu.Unlock()
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	c := &Client{Base: srv.URL}
	ctx := t.Context()
	_, _ = c.Bond(ctx, "TEBNb10")
	_, _ = c.Characteristics(ctx, "TEBNb10")
	_, _ = c.Coupons(ctx, "TEBNb10")
	_, _ = c.TradeInfo(ctx, "TEBNb10")
	_, _ = c.LastDeals(ctx, "TEBNb10")
	_, _ = c.News(ctx, "ASBN", "ru")

	for _, path := range []string{
		"/api/instruments/bonds/TEBNb10/",
		"/api/instruments/bonds/TEBNb10/characteristics/",
		"/api/instruments/coupon-payments/TEBNb10/",
		"/api/instruments/trade-info/TEBNb10/",
		"/api/instruments/last-deals/TEBNb10/",
		"/api/news/company/ASBN/?language=ru",
	} {
		if ua, ok := seen[path]; !ok {
			t.Errorf("path %s was not requested", path)
		} else if ua != userAgent {
			t.Errorf("path %s User-Agent = %q, want %q", path, ua, userAgent)
		}
	}
}

func TestClientErrors(t *testing.T) {
	for name, tc := range map[string]struct {
		status int
		body   string
		ct     string
		want   error
	}{
		"not_found":     {http.StatusNotFound, `{"detail":"not found"}`, "application/json", ErrNotFound},
		"server_error":  {http.StatusInternalServerError, `oops`, "text/plain", ErrUnavailable},
		"html_response": {http.StatusOK, `<html><body>kase.kz</body></html>`, "text/html", ErrUnavailable},
		"html_no_ct":    {http.StatusOK, "\n<!DOCTYPE html>", "", ErrUnavailable},
	} {
		t.Run(name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				if tc.ct != "" {
					w.Header().Set("Content-Type", tc.ct)
				}
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()
			c := &Client{Base: srv.URL}
			if _, err := c.Bond(t.Context(), "TEBNb10"); !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestPaceEnforcesGap(t *testing.T) {
	c := &Client{MinGap: 50 * time.Millisecond}
	start := time.Now()
	if err := c.pace(t.Context()); err != nil {
		t.Fatalf("first pace: %v", err)
	}
	if err := c.pace(t.Context()); err != nil {
		t.Fatalf("second pace: %v", err)
	}
	if d := time.Since(start); d < 50*time.Millisecond {
		t.Fatalf("two paced calls took %s, want ≥ 50ms", d)
	}
}

func TestPaceRespectsDeadline(t *testing.T) {
	c := &Client{MinGap: 50 * time.Millisecond}
	if err := c.pace(t.Context()); err != nil {
		t.Fatalf("first pace: %v", err)
	}
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Millisecond)
	defer cancel()
	if err := c.pace(ctx); err == nil {
		t.Fatal("pace with an expired deadline should fail, got nil")
	}
}
