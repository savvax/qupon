package api

// Task 701 tests: admin users (disable kills sessions, self-lockout),
// reset links (single use, expiry), RBAC, audit CSV, hidden series.

import (
	"encoding/csv"
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

func TestAdminDisableUserKillsSessionsAndLogin(t *testing.T) {
	h, svc, st := newAuthServer(t, false)
	admin := signIn(t, h, st, svc, "admin")
	victim := signIn(t, h, st, svc, "issuer")

	// Non-admin is refused on every admin route.
	for _, path := range []string{"/admin/users", "/admin/organizations", "/admin/series", "/admin/audit"} {
		if got := doGet(t, h, path, victim); got != http.StatusForbidden {
			t.Fatalf("%s as issuer = %d, want 403", path, got)
		}
	}
	if got := doGet(t, h, "/admin/users", ""); got != http.StatusUnauthorized {
		t.Fatalf("anonymous /admin/users = %d, want 401", got)
	}

	var list struct {
		Users []struct {
			ID    int64  `json:"id"`
			Email string `json:"email"`
		} `json:"users"`
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/admin/users?q=issuer@", nil)
	req.Header.Set("Authorization", "Bearer "+admin)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || json.Unmarshal(rec.Body.Bytes(), &list) != nil || len(list.Users) != 1 {
		t.Fatalf("list users = %d %s", rec.Code, rec.Body)
	}
	id := list.Users[0].ID

	// Disable: the old session dies and the next login is refused.
	patch := httptest.NewRequest(http.MethodPatch, "/admin/users/"+itoa(id), strings.NewReader(`{"status":"disabled"}`))
	patch.Header.Set("Authorization", "Bearer "+admin)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, patch)
	if rec.Code != http.StatusOK {
		t.Fatalf("disable = %d %s", rec.Code, rec.Body)
	}
	if got := doGet(t, h, "/me", victim); got != http.StatusUnauthorized {
		t.Fatalf("old session after disable = %d, want 401", got)
	}
	if code, body := doPost(t, h, "/auth/login", `{"email":"issuer@test.kz","password":"pw-issuer"}`, ""); code != http.StatusUnauthorized || body["code"] != "bad_credentials" {
		t.Fatalf("login after disable = %d %v", code, body)
	}

	// The admin cannot disable or demote herself.
	self := httptest.NewRequest(http.MethodPatch, "/admin/users/"+itoa(adminID(t, h, admin)), strings.NewReader(`{"status":"disabled"}`))
	self.Header.Set("Authorization", "Bearer "+admin)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, self)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "self_lockout") {
		t.Fatalf("self disable = %d %s, want 400 self_lockout", rec.Code, rec.Body)
	}
}

func TestAdminResetLinkSingleUseAndExpiry(t *testing.T) {
	h, svc, st := newAuthServer(t, false)
	admin := signIn(t, h, st, svc, "admin")
	code, body := doPost(t, h, "/admin/users", `{"email":"new@q.kz","name":"New","role":"investor","password":"longenough1"}`, admin)
	if code != http.StatusCreated || body["code"] == "email_taken" {
		t.Fatalf("create user = %d %v", code, body)
	}
	user, _ := body["user"].(map[string]any)
	id := int64(user["id"].(float64))

	// Duplicate email is a conflict.
	if code, _ := doPost(t, h, "/admin/users", `{"email":"new@q.kz","name":"New","role":"investor","password":"longenough1"}`, admin); code != http.StatusConflict {
		t.Fatalf("duplicate email = %d, want 409", code)
	}

	code, body = doPost(t, h, "/admin/users/"+itoa(id)+"/reset-link", `{}`, admin)
	url, _ := body["url"].(string)
	if code != http.StatusOK || !strings.Contains(url, "/reset/") || body["expiresAt"] == "" {
		t.Fatalf("reset-link = %d %v", code, body)
	}
	token := strings.TrimPrefix(url, "/reset/")

	// Reset sets the password and kills the old session.
	oldTok := signInDirect(t, h, st, "new@q.kz", "longenough1")
	if code, _ := doPost(t, h, "/auth/reset", `{"token":"`+token+`","password":"freshpassword"}`, ""); code != http.StatusNoContent {
		t.Fatalf("reset = %d", code)
	}
	if got := doGet(t, h, "/me", oldTok); got != http.StatusUnauthorized {
		t.Fatalf("session survived reset = %d", got)
	}
	if got := doGet(t, h, "/me", signInDirect(t, h, st, "new@q.kz", "freshpassword")); got != http.StatusOK {
		t.Fatalf("login with new password = %d", got)
	}
	// A token works exactly once; a weak password is refused.
	if code, body := doPost(t, h, "/auth/reset", `{"token":"`+token+`","password":"anotherpass1"}`, ""); code != http.StatusBadRequest || body["code"] != "invalid_token" {
		t.Fatalf("reuse = %d %v", code, body)
	}
	if code, body := doPost(t, h, "/auth/reset", `{"token":"x","password":"short"}`, ""); code != http.StatusBadRequest || body["code"] != "invalid_params" {
		t.Fatalf("weak = %d %v", code, body)
	}

	// An expired link is invalid_token.
	if err := st.CreateResetLink(t.Context(), auth.HashToken("expiredtok"), id, time.Now().Add(-time.Minute).Unix(), 1); err != nil {
		t.Fatal(err)
	}
	if code, body := doPost(t, h, "/auth/reset", `{"token":"expiredtok","password":"longenough2"}`, ""); code != http.StatusBadRequest || body["code"] != "invalid_token" {
		t.Fatalf("expired = %d %v", code, body)
	}
}

func TestAdminAuditCSVHeaderAndEscaping(t *testing.T) {
	h, svc, st := newAuthServer(t, false)
	admin := signIn(t, h, st, svc, "admin")
	if code, _ := doPost(t, h, "/admin/users", `{"email":"csv@q.kz","name":"CSV, Test","role":"registrar","password":"longenough1"}`, admin); code != http.StatusCreated {
		t.Fatalf("create = %d", code)
	}
	req := httptest.NewRequest(http.MethodGet, "/admin/audit?format=csv&user=admin@test.kz", nil)
	req.Header.Set("Authorization", "Bearer "+admin)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/csv") {
		t.Fatalf("csv = %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}
	rows, err := csv.NewReader(rec.Body).ReadAll()
	if err != nil {
		t.Fatalf("parse csv: %v", err)
	}
	if len(rows) != 2 || rows[0][0] != "id" || rows[0][4] != "route" {
		t.Fatalf("rows = %+v, want header + 1", rows)
	}
	// The audit params contain commas; the quoted field must round-trip as one cell.
	if !strings.Contains(rows[1][7], "csv@q.kz") || !strings.Contains(rows[1][7], ",") || len(rows[1]) != 9 {
		t.Fatalf("escaping broken: %+v", rows[1])
	}
	// JSON view carries the acting user's email and filters work.
	req2 := httptest.NewRequest(http.MethodGet, "/admin/audit?user=admin@test.kz&ok=true&route=users", nil)
	req2.Header.Set("Authorization", "Bearer "+admin)
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req2)
	var feed struct {
		Entries []struct {
			Email string `json:"email"`
			Route string `json:"route"`
		} `json:"entries"`
	}
	if rec2.Code != http.StatusOK || json.Unmarshal(rec2.Body.Bytes(), &feed) != nil || len(feed.Entries) != 1 || feed.Entries[0].Email != "admin@test.kz" || feed.Entries[0].Route != "POST /admin/users" {
		t.Fatalf("filtered feed = %d %s", rec2.Code, rec2.Body)
	}
}

func TestAdminHideSeriesAndList(t *testing.T) {
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "admin-series.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(5, time.Minute)}
	h := New(slog.New(slog.DiscardHandler), st, Deps{Auth: svc, Read: fakeRead{}})
	admin := signIn(t, h, st, svc, "admin")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPatch, "/admin/series/"+fMint.String(), strings.NewReader(`{"hidden":true,"kaseTicker":"TEBNb10"}`))
	req.Header.Set("Authorization", "Bearer "+admin)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("hide = %d %s", rec.Code, rec.Body)
	}

	// Hidden series leave the public list but stay in the admin list.
	var public []json.RawMessage
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/series", nil))
	if json.Unmarshal(rec.Body.Bytes(), &public) != nil || len(public) != 0 {
		t.Fatalf("public series after hide = %s", rec.Body)
	}
	var adminList struct {
		Series []struct {
			Mint       string `json:"mint"`
			Hidden     bool   `json:"hidden"`
			KaseTicker string `json:"kaseTicker"`
		} `json:"series"`
	}
	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/admin/series", nil)
	req.Header.Set("Authorization", "Bearer "+admin)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || json.Unmarshal(rec.Body.Bytes(), &adminList) != nil ||
		len(adminList.Series) != 1 || adminList.Series[0].Mint != fMint.String() || !adminList.Series[0].Hidden || adminList.Series[0].KaseTicker != "TEBNb10" {
		t.Fatalf("admin series = %d %s", rec.Code, rec.Body)
	}

	// Bad ticker is refused.
	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPatch, "/admin/series/"+fMint.String(), strings.NewReader(`{"kaseTicker":"../x"}`))
	req.Header.Set("Authorization", "Bearer "+admin)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("bad ticker = %d, want 400", rec.Code)
	}
}

func TestAdminOrganizations(t *testing.T) {
	h, svc, st := newAuthServer(t, false)
	admin := signIn(t, h, st, svc, "admin")
	code, body := doPost(t, h, "/admin/organizations", `{"name":"KASE Issuer JSC","kind":"issuer","bin":"123456"}`, admin)
	if code != http.StatusCreated {
		t.Fatalf("create org = %d %s", code, body)
	}
	org, _ := body["organization"].(map[string]any)
	id := itoa(int64(org["id"].(float64)))
	if code, _ := doPost(t, h, "/admin/organizations", `{"name":"Bad","kind":"bank"}`, admin); code != http.StatusBadRequest {
		t.Fatalf("bad kind = %d", code)
	}
	if code, _ := doPatch(t, h, "/admin/organizations/"+id, `{"website":"https://kase.kz"}`, admin); code != http.StatusOK {
		t.Fatalf("patch org = %d", code)
	}
	got, err := st.GetOrganization(t.Context(), 1)
	if err != nil || got.Website != "https://kase.kz" || got.BIN != "123456" {
		t.Fatalf("org after patch = %+v %v", got, err)
	}
	if code, _ := doPatch(t, h, "/admin/organizations/999", `{"name":"X"}`, admin); code != http.StatusNotFound {
		t.Fatalf("missing org = %d, want 404", code)
	}
}

// --- small helpers -------------------------------------------------------

func itoa(n int64) string { return strconvFormat(n) }

func strconvFormat(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

func signInDirect(t *testing.T, h http.Handler, st *store.Store, email, password string) string {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/auth/login",
		strings.NewReader(`{"email":"`+email+`","password":"`+password+`"}`)))
	var out struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&out); err != nil || out.Token == "" {
		t.Fatalf("sign in %s: %d", email, rec.Code)
	}
	return out.Token
}

func doPatch(t *testing.T, h http.Handler, path, body, token string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPatch, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.NewDecoder(rec.Body).Decode(&out)
	return rec.Code, out
}

func adminID(t *testing.T, h http.Handler, token string) int64 {
	t.Helper()
	var me struct {
		User struct {
			ID int64 `json:"id"`
		} `json:"user"`
	}
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if json.Unmarshal(rec.Body.Bytes(), &me) != nil {
		t.Fatalf("/me = %s", rec.Body)
	}
	return me.User.ID
}
