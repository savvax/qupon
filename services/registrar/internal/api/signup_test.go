package api

import (
	"log/slog"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

func TestSignup(t *testing.T) {
	h, _, st := newAuthServer(t, false)
	body := func(email, pw string) string {
		return `{"email":"` + email + `","name":"Aigerim","password":"` + pw + `","locale":"ru"}`
	}
	tests := []struct {
		name, email, pw string
		code            int
		errCode         string
	}{
		{"creates an active investor", " Aigerim@Example.KZ ", "steppe-bonds-2026", http.StatusOK, ""},
		{"duplicate email (case-insensitive)", "aigerim@example.kz", "another-pass-99", http.StatusConflict, "email_taken"},
		{"short password", "b@example.kz", "short", http.StatusBadRequest, "weak_password"},
		{"deny-listed password", "c@example.kz", "Password123", http.StatusBadRequest, "weak_password"},
		{"bad email", "not-an-email", "steppe-bonds-2026", http.StatusBadRequest, "invalid_params"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			code, out := doPost(t, h, "/auth/signup", body(tc.email, tc.pw), "")
			if code != tc.code {
				t.Fatalf("code = %d, want %d (%v)", code, tc.code, out)
			}
			if tc.errCode != "" && out["code"] != tc.errCode {
				t.Fatalf("error code = %v, want %s", out["code"], tc.errCode)
			}
			if tc.code == http.StatusOK {
				tok, _ := out["token"].(string)
				if tok == "" {
					t.Fatal("no session token")
				}
				if doGet(t, h, "/me", tok) != http.StatusOK {
					t.Fatal("the new session does not authenticate")
				}
			}
		})
	}
	u, _, err := st.UserByEmail(t.Context(), "aigerim@example.kz")
	if err != nil || u.Role != "investor" || u.Locale != "ru" || u.Status != "active" {
		t.Fatalf("stored user = %+v, %v", u, err)
	}
}

func TestSignupSharesTheSignInLimit(t *testing.T) {
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "signup.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour}
	h := New(slog.New(slog.DiscardHandler), st, Deps{Auth: svc, SignInLimit: auth.NewLimiter(2, time.Minute)})
	codes := []int{}
	for range 3 {
		c, _ := doPost(t, h, "/auth/signup", `{"email":"x@example.kz","name":"X","password":"short"}`, "")
		codes = append(codes, c)
	}
	if codes[2] != http.StatusTooManyRequests {
		t.Fatalf("codes = %v, want the third to be 429", codes)
	}
}
