// Package kase reads public market data from kase.kz (platform v2 §5.5): a
// polite HTTP client (fixed User-Agent, 5 s timeout, at most one request per
// second), normalisers for the captured response shapes and a SQLite-backed
// cache that keeps the last good body for stale-if-error serving.
package kase

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Upstream failures the API maps to status codes (task 1001).
var (
	// ErrNotFound: kase.kz answered 404 (unknown ticker or issuer code).
	ErrNotFound = errors.New("kase: not found")
	// ErrUnavailable: kase.kz answered 5xx/4xx, timed out, or served HTML (its UI page) instead of JSON.
	ErrUnavailable = errors.New("kase: unavailable")
	// ErrInvalidCode: a ticker or issuer code that does not match ^[A-Za-z0-9]{2,12}$ (spec §6 —
	// no user input reaches URLs except validated codes).
	ErrInvalidCode = errors.New("kase: invalid ticker or issuer code")
)

// userAgent identifies the registrar to kase.kz (their ops can find the contact).
const userAgent = "Qupon/1.0 (+https://qupon.85-192-29-7.sslip.io)"

// ValidCode admits tickers and issuer codes into URLs: ^[A-Za-z0-9]{2,12}$.
func ValidCode(s string) bool {
	if len(s) < 2 || len(s) > 12 {
		return false
	}
	for _, r := range s {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' {
			continue
		}
		return false
	}
	return true
}

// Client is the kase.kz HTTP client. Create one per process and share it: the
// token bucket paces every request through it (spec §5.5: ≤1 request/second).
type Client struct {
	// Base is scheme://host without a trailing slash; "" means https://kase.kz.
	// Tests point it at an httptest server.
	Base string
	// MinGap is the global request pacing interval; 0 disables pacing (tests only).
	MinGap time.Duration
	// Timeout bounds one request; 0 means the spec's 5 s.
	Timeout time.Duration

	hc   *http.Client
	mu   sync.Mutex
	next time.Time // earliest instant the next request may go out
}

// NewClient returns the production client: kase.kz, 5 s timeout, 1 req/s.
func NewClient() *Client {
	return &Client{MinGap: time.Second, Timeout: 5 * time.Second}
}

func (c *Client) httpClient() *http.Client {
	if c.hc != nil {
		return c.hc
	}
	return http.DefaultClient
}

// pace reserves the next global slot; a token bucket that holds one token and
// refills at one per MinGap.
func (c *Client) pace(ctx context.Context) error {
	if c.MinGap <= 0 {
		return nil
	}
	c.mu.Lock()
	now := time.Now()
	if c.next.Before(now) {
		c.next = now
	}
	at := c.next
	c.next = c.next.Add(c.MinGap)
	c.mu.Unlock()
	if d := time.Until(at); d > 0 {
		if dl, ok := ctx.Deadline(); ok && at.After(dl) {
			return fmt.Errorf("%w: waiting for the rate-limit slot would exceed the deadline", ErrUnavailable)
		}
		t := time.NewTimer(d)
		defer t.Stop()
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-t.C:
		}
	}
	return nil
}

// get fetches one kase.kz JSON API path. Paths keep their trailing slash:
// kase.kz's own links use it and redirect without it.
func (c *Client) get(ctx context.Context, path string) ([]byte, error) {
	if err := c.pace(ctx); err != nil {
		return nil, err
	}
	base := c.Base
	if base == "" {
		base = "https://kase.kz"
	}
	timeout := c.Timeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, base+path, nil)
	if err != nil {
		return nil, fmt.Errorf("kase request %s: %w", path, err)
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/json")
	resp, err := c.httpClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: request %s: %v", ErrUnavailable, path, err)
	}
	defer func() { _ = resp.Body.Close() }()
	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusNotFound:
		return nil, fmt.Errorf("%w: %s", ErrNotFound, path)
	default:
		return nil, fmt.Errorf("%w: %s answered %d", ErrUnavailable, path, resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, fmt.Errorf("%w: read %s: %v", ErrUnavailable, path, err)
	}
	// kase.kz falls back to HTML pages for unknown shapes or when blocking: never parse those as data.
	if strings.Contains(resp.Header.Get("Content-Type"), "text/html") || startsWithLT(body) {
		return nil, fmt.Errorf("%w: %s returned HTML, not JSON", ErrUnavailable, path)
	}
	return body, nil
}

func startsWithLT(b []byte) bool {
	for _, c := range b {
		switch c {
		case ' ', '\t', '\r', '\n':
			continue
		case '<':
			return true
		default:
			return false
		}
	}
	return false
}

// Typed endpoints (task 1001 path list). The ticker/issuer arguments are
// already validated by the caller (ValidCode) or produced by this package.

func (c *Client) Bond(ctx context.Context, ticker string) ([]byte, error) {
	return c.get(ctx, "/api/instruments/bonds/"+ticker+"/")
}

func (c *Client) Characteristics(ctx context.Context, ticker string) ([]byte, error) {
	return c.get(ctx, "/api/instruments/bonds/"+ticker+"/characteristics/")
}

func (c *Client) Coupons(ctx context.Context, ticker string) ([]byte, error) {
	return c.get(ctx, "/api/instruments/coupon-payments/"+ticker+"/")
}

func (c *Client) TradeInfo(ctx context.Context, ticker string) ([]byte, error) {
	return c.get(ctx, "/api/instruments/trade-info/"+ticker+"/")
}

func (c *Client) LastDeals(ctx context.Context, ticker string) ([]byte, error) {
	return c.get(ctx, "/api/instruments/last-deals/"+ticker+"/")
}

func (c *Client) News(ctx context.Context, issuer, lang string) ([]byte, error) {
	return c.get(ctx, "/api/news/company/"+issuer+"/?language="+lang)
}
