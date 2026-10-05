package auth

import (
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

func svc(t *testing.T, demo bool) (*Service, *store.Store, *time.Time) {
	t.Helper()
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "a.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	now := time.Unix(1_000_000, 0)
	s := &Service{Store: st, Now: func() time.Time { return now }, TTL: 12 * time.Hour, DemoLogin: demo, Limit: NewLimiter(5, time.Minute)}
	return s, st, &now
}

func TestLoginLogout(t *testing.T) {
	s, st, _ := svc(t, false)
	h, _ := HashPassword("correct horse")
	if _, err := st.UpsertUser(t.Context(), store.User{Email: "r@q.kz", Name: "R", Role: "registrar"}, h); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.Login(t.Context(), "r@q.kz", "wrong"); !errors.Is(err, ErrBadCredentials) {
		t.Fatalf("wrong password err = %v", err)
	}
	if _, _, err := s.Login(t.Context(), "nobody@q.kz", "x"); !errors.Is(err, ErrBadCredentials) {
		t.Fatalf("unknown email must look identical: %v", err)
	}
	tok, u, err := s.Login(t.Context(), "r@q.kz", "correct horse")
	if err != nil || u.Role != "registrar" || len(tok) < 40 {
		t.Fatalf("login = %q %+v %v", tok, u, err)
	}
	if got, err := s.Authenticate(t.Context(), tok); err != nil || got.Email != "r@q.kz" {
		t.Fatalf("authenticate = %+v %v", got, err)
	}
	if err := s.Logout(t.Context(), tok); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Authenticate(t.Context(), tok); !errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("after logout err = %v", err)
	}
}

func TestSessionExpires(t *testing.T) {
	s, st, now := svc(t, false)
	h, _ := HashPassword("pw")
	_, _ = st.UpsertUser(t.Context(), store.User{Email: "i@q.kz", Name: "I", Role: "issuer"}, h)
	tok, _, _ := s.Login(t.Context(), "i@q.kz", "pw")
	*now = now.Add(12*time.Hour + time.Second)
	if _, err := s.Authenticate(t.Context(), tok); !errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("expired err = %v", err)
	}
}

func TestRateLimitPerEmail(t *testing.T) {
	s, st, _ := svc(t, false)
	h, _ := HashPassword("pw")
	_, _ = st.UpsertUser(t.Context(), store.User{Email: "i@q.kz", Name: "I", Role: "issuer"}, h)
	for i := 0; i < 5; i++ {
		_, _, _ = s.Login(t.Context(), "i@q.kz", "bad")
	}
	if _, _, err := s.Login(t.Context(), "i@q.kz", "pw"); !errors.Is(err, ErrRateLimited) {
		t.Fatalf("6th attempt err = %v, want ErrRateLimited", err)
	}
}

func TestDemoGate(t *testing.T) {
	off, _, _ := svc(t, false)
	if _, _, err := off.Demo(t.Context(), "issuer"); !errors.Is(err, ErrDemoDisabled) {
		t.Fatalf("demo off err = %v", err)
	}
	on, st, _ := svc(t, true)
	_, _ = st.UpsertUser(t.Context(), store.User{Email: "demo-issuer@qupon.demo", Name: "Demo issuer", Role: "issuer", IsDemo: true}, "!")
	tok, u, err := on.Demo(t.Context(), "issuer")
	if err != nil || !u.IsDemo || tok == "" {
		t.Fatalf("demo = %q %+v %v", tok, u, err)
	}
}

func TestTokenHashing(t *testing.T) {
	raw, hash, err := NewToken()
	if err != nil || HashToken(raw) != hash || raw == hash || len(hash) != 64 {
		t.Fatalf("token %q hash %q err %v", raw, hash, err)
	}
}
