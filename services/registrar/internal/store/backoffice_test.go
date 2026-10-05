// internal/store/backoffice_test.go
package store

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
)

func openT(t *testing.T) *Store {
	t.Helper()
	st, err := Open(t.Context(), filepath.Join(t.TempDir(), "bo.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return st
}

func TestUsersAndSessions(t *testing.T) {
	st := openT(t)
	id, err := st.UpsertUser(t.Context(), User{Email: "i@q.kz", Name: "Issuer", Role: "issuer"}, "hash1")
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	u, hash, err := st.UserByEmail(t.Context(), "i@q.kz")
	if err != nil || u.ID != id || hash != "hash1" || u.Role != "issuer" {
		t.Fatalf("by email = %+v %q %v", u, hash, err)
	}
	if err := st.CreateSession(t.Context(), "th", id, 100); err != nil {
		t.Fatalf("session: %v", err)
	}
	if got, err := st.SessionUser(t.Context(), "th", 99); err != nil || got.ID != id {
		t.Fatalf("session user = %+v %v", got, err)
	}
	if _, err := st.SessionUser(t.Context(), "th", 100); !errors.Is(err, ErrNoSession) {
		t.Fatalf("expired session err = %v, want ErrNoSession", err)
	}
	if err := st.DeleteSession(t.Context(), "th"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, _, err := st.UserByEmail(t.Context(), "nobody@q.kz"); !errors.Is(err, ErrNoUser) {
		t.Fatalf("missing user err = %v", err)
	}
}

func TestAuditAndRegistry(t *testing.T) {
	st := openT(t)
	e := AuditEntry{Ts: 1, UserID: 7, Role: "registrar", Route: "POST /registrar/investors", Params: json.RawMessage(`{"a":1}`), OK: true, Detail: "ok", Signatures: []string{"s1"}}
	if err := st.InsertAudit(t.Context(), e); err != nil {
		t.Fatalf("audit: %v", err)
	}
	got, err := st.ListAudit(t.Context(), 10)
	if err != nil || len(got) != 1 || got[0].Signatures[0] != "s1" || !got[0].OK {
		t.Fatalf("list audit = %+v %v", got, err)
	}
	r := RegistryRow{Name: "QPN2", Mint: "M", Terms: json.RawMessage(`{"isin":"KZ2C0QUPON02"}`)}
	if err := st.InsertRegistry(t.Context(), r); err != nil {
		t.Fatalf("insert: %v", err)
	}
	if err := st.InsertRegistry(t.Context(), r); !errors.Is(err, ErrSeriesExists) {
		t.Fatalf("duplicate err = %v, want ErrSeriesExists", err)
	}
	rows, err := st.ListRegistry(t.Context())
	if err != nil || len(rows) != 1 || rows[0].Mint != "M" {
		t.Fatalf("list registry = %+v %v", rows, err)
	}
}
