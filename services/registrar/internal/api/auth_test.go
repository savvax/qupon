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

func newAuthServer(t *testing.T, demo bool) (http.Handler, *auth.Service, *store.Store) {
	t.Helper()
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "auth.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: 12 * time.Hour, DemoLogin: demo, Limit: auth.NewLimiter(5, time.Minute)}
	return New(slog.New(slog.DiscardHandler), st, Deps{Auth: svc, TestRoutes: true}), svc, st
}

func signIn(t *testing.T, h http.Handler, st *store.Store, _ *auth.Service, role string) string {
	t.Helper()
	hash, _ := auth.HashPassword("pw-" + role)
	email := role + "@test.kz"
	if _, err := st.UpsertUser(t.Context(), store.User{Email: email, Name: role, Role: role}, hash); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"email":"`+email+`","password":"pw-`+role+`"}`)))
	var out struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&out); err != nil || out.Token == "" {
		t.Fatalf("sign in %s: %d %v", role, rec.Code, err)
	}
	return out.Token
}

func doGet(t *testing.T, h http.Handler, path, token string) int {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code
}

func doPost(t *testing.T, h http.Handler, path, body, token string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.NewDecoder(rec.Body).Decode(&out)
	return rec.Code, out
}

func TestLoginMeLogout(t *testing.T) {
	h, svc, st := newAuthServer(t, false)
	tok := signIn(t, h, st, svc, "registrar")

	code, body := doPost(t, h, "/auth/login", `{"email":"registrar@test.kz","password":"wrong"}`, "")
	if code != http.StatusUnauthorized || body["code"] != "bad_credentials" {
		t.Fatalf("wrong password = %d %v", code, body)
	}
	if code, _ := doPost(t, h, "/auth/login", `{"email":""}`, ""); code != http.StatusBadRequest {
		t.Fatalf("empty login = %d, want 400", code)
	}
	if got := doGet(t, h, "/me", ""); got != http.StatusUnauthorized {
		t.Fatalf("/me without bearer = %d", got)
	}
	if got := doGet(t, h, "/me", tok); got != http.StatusOK {
		t.Fatalf("/me = %d", got)
	}
	if code, _ := doPost(t, h, "/auth/logout", "", tok); code != http.StatusNoContent {
		t.Fatalf("logout = %d", code)
	}
	if got := doGet(t, h, "/me", tok); got != http.StatusUnauthorized {
		t.Fatalf("/me after logout = %d, want 401", got)
	}
}

func TestDemoSignIn(t *testing.T) {
	off, _, _ := newAuthServer(t, false)
	if code, body := doPost(t, off, "/auth/demo", `{"role":"issuer"}`, ""); code != http.StatusForbidden || body["code"] != "demo_disabled" {
		t.Fatalf("demo disabled = %d %v", code, body)
	}
	on, _, st := newAuthServer(t, true)
	if _, err := st.UpsertUser(t.Context(), store.User{Email: "demo-investor@qupon.demo", Name: "Demo investor", Role: "investor_demo", IsDemo: true}, "!"); err != nil {
		t.Fatal(err)
	}
	code, body := doPost(t, on, "/auth/demo", `{"role":"investor"}`, "")
	user, _ := body["user"].(map[string]any)
	if code != http.StatusOK || body["token"] == "" || user["isDemo"] != true || user["role"] != "investor_demo" {
		t.Fatalf("demo investor = %d %v", code, body)
	}
	if code, _ := doPost(t, on, "/auth/demo", `{"role":"admin"}`, ""); code != http.StatusBadRequest {
		t.Fatalf("demo admin = %d, want 400", code)
	}
}

func TestRBACMatrix(t *testing.T) {
	h, svc, st := newAuthServer(t, false)
	issuer := signIn(t, h, st, svc, "issuer")
	registrar := signIn(t, h, st, svc, "registrar")
	for _, tc := range []struct {
		token string
		want  int
	}{{"", http.StatusUnauthorized}, {"not-a-token", http.StatusUnauthorized}, {issuer, http.StatusForbidden}, {registrar, http.StatusOK}} {
		if got := doGet(t, h, "/_test/registrar", tc.token); got != tc.want {
			t.Errorf("token %q: status %d, want %d", tc.token, got, tc.want)
		}
	}
	// Write routes that sign with operator keys are role-gated too (no executor needed to see the gate).
	for _, path := range []string{"/actions/" + fAction.String() + "/advance", "/registrar/actions/" + fAction.String() + "/advance", "/approvals/1/approve"} {
		if code, _ := doPost(t, h, path, `{"confirm":true}`, ""); code != http.StatusUnauthorized {
			t.Errorf("%s without session = %d, want 401", path, code)
		}
		if code, _ := doPost(t, h, path, `{"confirm":true}`, issuer); code != http.StatusForbidden {
			t.Errorf("%s as issuer = %d, want 403", path, code)
		}
	}
}

func TestExpiredSessionIs401(t *testing.T) {
	h, svc, st := newAuthServer(t, false)
	tok := signIn(t, h, st, svc, "registrar")
	svc.Now = func() time.Time { return time.Now().Add(13 * time.Hour) }
	if got := doGet(t, h, "/_test/registrar", tok); got != http.StatusUnauthorized {
		t.Fatalf("expired session = %d, want 401", got)
	}
}

// Demo users share accounts: their writes are capped per role; real accounts are never throttled.
func TestDemoWritesAreThrottled(t *testing.T) {
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "throttle.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, DemoLogin: true, Limit: auth.NewLimiter(5, time.Minute)}
	h := New(slog.New(slog.DiscardHandler), st, Deps{Auth: svc, DemoLimit: auth.NewLimiter(2, time.Hour)})
	if _, err := st.UpsertUser(t.Context(), store.User{Email: "demo-registrar@qupon.demo", Name: "Demo registrar", Role: "registrar", IsDemo: true}, "!"); err != nil {
		t.Fatal(err)
	}
	_, body := doPost(t, h, "/auth/demo", `{"role":"registrar"}`, "")
	demo, _ := body["token"].(string)
	real := signIn(t, h, st, svc, "registrar")
	path := "/registrar/actions/" + fAction.String() + "/advance"
	for i, want := range []int{http.StatusServiceUnavailable, http.StatusServiceUnavailable, http.StatusTooManyRequests} {
		if code, b := doPost(t, h, path, `{"confirm":true}`, demo); code != want || (want == http.StatusTooManyRequests && b["code"] != "demo_throttled") {
			t.Fatalf("demo write %d = %d %v, want %d", i, code, b, want)
		}
	}
	for i := 0; i < 4; i++ {
		if code, _ := doPost(t, h, path, `{"confirm":true}`, real); code == http.StatusTooManyRequests {
			t.Fatalf("real registrar throttled on write %d", i)
		}
	}
}

// The web session proxy forwards X-Forwarded-For, so every visitor gets its own
// sign-in bucket (task 1406): the 21st click from one address is a 429, a second
// address is untouched. Demo sign-in stays disabled (403) — the bucket is what is tested.
func TestSignInRateLimitPerForwardedIP(t *testing.T) {
	h := New(slog.New(slog.DiscardHandler), nil, Deps{
		Auth:        &auth.Service{DemoLogin: false},
		SignInLimit: auth.NewLimiter(20, time.Minute),
	})
	post := func(xff string) int {
		req := httptest.NewRequest(http.MethodPost, "/auth/demo", strings.NewReader(`{"role":"issuer"}`))
		if xff != "" {
			req.Header.Set("X-Forwarded-For", xff)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	for i := 1; i <= 20; i++ {
		if code := post("203.0.113.7"); code != http.StatusForbidden {
			t.Fatalf("sign-in %d from 203.0.113.7 = %d, want 403 (allowed, demo disabled)", i, code)
		}
	}
	if code := post("203.0.113.7"); code != http.StatusTooManyRequests {
		t.Fatalf("21st sign-in from 203.0.113.7 = %d, want 429", code)
	}
	if code := post("198.51.100.9"); code != http.StatusForbidden {
		t.Fatalf("first sign-in from 198.51.100.9 = %d, want 403 (separate bucket)", code)
	}
	// Only the last XFF hop (the one the closest proxy appended) counts.
	if code := post("9.9.9.9, 203.0.113.7"); code != http.StatusTooManyRequests {
		t.Fatalf("XFF list ending in the blocked IP = %d, want 429", code)
	}
	if code := post("203.0.113.7, 9.9.9.9"); code != http.StatusForbidden {
		t.Fatalf("XFF list ending in a fresh IP = %d, want 403", code)
	}
}
