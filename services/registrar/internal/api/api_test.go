package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

func newTestServer(t *testing.T) (http.Handler, *store.Store) {
	t.Helper()
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "api.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return New(slog.New(slog.DiscardHandler), st, nil), st
}

func TestHealthz(t *testing.T) {
	handler, _ := newTestServer(t)
	srv := httptest.NewServer(handler)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/healthz")
	if err != nil {
		t.Fatalf("get healthz: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("healthz status = %d, want 200", resp.StatusCode)
	}
}

func TestOpenAPI(t *testing.T) {
	handler, _ := newTestServer(t)
	srv := httptest.NewServer(handler)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/openapi.yaml")
	if err != nil {
		t.Fatalf("get openapi: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("openapi status = %d, want 200", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/yaml" {
		t.Fatalf("content-type = %q, want application/yaml", ct)
	}
}

func TestActivity(t *testing.T) {
	h, _ := newTestServer(t)
	srv := httptest.NewServer(h)
	defer srv.Close()

	// fresh store: empty ordered feed
	resp, err := http.Get(srv.URL + "/activity")
	if err != nil {
		t.Fatalf("get activity: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("activity status = %d, want 200", resp.StatusCode)
	}
	var out struct {
		Events []store.Activity `json:"events"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(out.Events) != 0 {
		t.Fatalf("events = %d, want 0 on a fresh store", len(out.Events))
	}
}

func TestActivityLimit(t *testing.T) {
	h, _ := newTestServer(t)
	srv := httptest.NewServer(h)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/activity?limit=nope")
	if err != nil {
		t.Fatalf("get activity: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("activity status = %d, want 400", resp.StatusCode)
	}
}

func TestCORSLocalhost(t *testing.T) {
	handler, _ := newTestServer(t)
	srv := httptest.NewServer(handler)
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodOptions, srv.URL+"/series", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("options: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("allow-origin = %q", got)
	}
}

func TestSeriesEndpoint(t *testing.T) {
	handler, st := newTestServer(t)
	if err := st.UpsertSeries(t.Context(), "MintAAA", []byte(`{"ticker":"QPNB1"}`)); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if err := st.UpsertSeries(t.Context(), "MintAAA", []byte(`{"ticker":"QPNB1","faceValue":100000}`)); err != nil {
		t.Fatalf("re-upsert: %v", err)
	}
	if err := st.UpsertSeries(t.Context(), "MintZZZ", []byte(`{"ticker":"BTRKdemo"}`)); err != nil {
		t.Fatalf("upsert: %v", err)
	}

	srv := httptest.NewServer(handler)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/series")
	if err != nil {
		t.Fatalf("get /series: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	var rows []map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2 (upsert replaces)", len(rows))
	}
	if rows[0]["ticker"] != "QPNB1" || rows[0]["faceValue"] != float64(100000) {
		t.Errorf("row0 = %v", rows[0])
	}
	if rows[1]["ticker"] != "BTRKdemo" {
		t.Errorf("row1 = %v (ordered by mint)", rows[1])
	}
}

func TestNoticeParamValidation(t *testing.T) {
	h, _ := newTestServer(t)
	srv := httptest.NewServer(h)
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/actions/9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM/notice?lang=de")
	if err != nil {
		t.Fatalf("get notice: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad lang status = %d, want 400", resp.StatusCode)
	}

	resp, err = http.Get(srv.URL + "/actions/not-a-pk/notice")
	if err != nil {
		t.Fatalf("get notice: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad pda status = %d, want 400", resp.StatusCode)
	}

	// nil reader configured (newTestServer passes nil): 503
	resp, err = http.Get(srv.URL + "/actions/9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM/notice")
	if err != nil {
		t.Fatalf("get notice: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("nil reader status = %d, want 503", resp.StatusCode)
	}
}
