package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

func doMethod(t *testing.T, h http.Handler, method, path, body, token string) (int, string) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code, rec.Body.String()
}

func TestProfileAndPassword(t *testing.T) {
	h, svc, st := newAuthServer(t, true)
	tok := signIn(t, h, st, svc, "investor")
	other := signIn(t, h, st, svc, "investor") // a second session of the same account

	if code, body := doMethod(t, h, "PATCH", "/me/profile", `{"name":"Mira K","locale":"ru"}`, tok); code != 200 || !strings.Contains(body, `"locale":"ru"`) {
		t.Fatalf("profile: %d %s", code, body)
	}
	if u, _, _ := st.UserByEmail(t.Context(), "investor@test.kz"); u.Name != "Mira K" || u.Locale != "ru" {
		t.Fatalf("stored = %+v", u)
	}
	if code, _ := doMethod(t, h, "PATCH", "/me/profile", `{"locale":"kz"}`, tok); code != 400 {
		t.Fatalf("bad locale: %d", code)
	}

	if code, body := doMethod(t, h, "POST", "/me/password", `{"current":"nope","new":"a-new-long-password"}`, tok); code != 400 || !strings.Contains(body, "bad_credentials") {
		t.Fatalf("wrong current: %d %s", code, body)
	}
	if code, body := doMethod(t, h, "POST", "/me/password", `{"current":"pw-investor","new":"short"}`, tok); code != 400 || !strings.Contains(body, "weak_password") {
		t.Fatalf("weak: %d %s", code, body)
	}
	if code, body := doMethod(t, h, "POST", "/me/password", `{"current":"pw-investor","new":"a-new-long-password"}`, tok); code != 200 {
		t.Fatalf("change: %d %s", code, body)
	}
	if code := doGet(t, h, "/me", tok); code != 200 {
		t.Fatalf("this session must survive: %d", code)
	}
	if code := doGet(t, h, "/me", other); code != http.StatusUnauthorized {
		t.Fatalf("other session must be signed out: %d", code)
	}
	if code, _ := doPost(t, h, "/auth/login", `{"email":"investor@test.kz","password":"a-new-long-password"}`, ""); code != 200 {
		t.Fatalf("login with the new password: %d", code)
	}

	if _, err := st.UpsertUser(t.Context(), store.User{Email: "demo-investor@qupon.demo", Name: "Demo", Role: "investor_demo", IsDemo: true}, "!"); err != nil {
		t.Fatal(err)
	}
	_, out := doPost(t, h, "/auth/demo", `{"role":"investor"}`, "")
	demo, _ := out["token"].(string)
	if code, body := doMethod(t, h, "PATCH", "/me/profile", `{"name":"X"}`, demo); code != 403 || !strings.Contains(body, "demo_account") {
		t.Fatalf("demo profile: %d %s", code, body)
	}
}
