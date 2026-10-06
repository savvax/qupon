package store

// Task 701: admin store methods — user filters, email-taken, reset-link single
// use/expiry, org update, audit search with the user's email resolved.

import (
	"errors"
	"strconv"
	"testing"
	"time"
)

func seedAdminUsers(t *testing.T, st *Store) (issuerID, adminID int64) {
	t.Helper()
	issuer, err := st.CreateUser(t.Context(), User{Email: "i@q.kz", Name: "Iss", Role: "issuer"}, "h")
	if err != nil {
		t.Fatal(err)
	}
	admin, err := st.CreateUser(t.Context(), User{Email: "a@q.kz", Name: "Adm", Role: "admin"}, "h")
	if err != nil {
		t.Fatal(err)
	}
	return issuer.ID, admin.ID
}

func TestAdminUsersListCreateUpdate(t *testing.T) {
	st := openT(t)
	issuerID, adminID := seedAdminUsers(t, st)

	if _, err := st.CreateUser(t.Context(), User{Email: "i@q.kz", Name: "Dup", Role: "issuer"}, "h"); !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("duplicate = %v, want ErrEmailTaken", err)
	}
	if _, err := st.GetUser(t.Context(), 999); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing user = %v, want ErrNotFound", err)
	}

	// Search by email fragment and filter by role+status.
	if err := st.UpdateUser(t.Context(), User{ID: issuerID, Email: "i@q.kz", Name: "Iss", Role: "issuer", Status: "disabled"}); err != nil {
		t.Fatal(err)
	}
	got, err := st.ListUsers(t.Context(), "i@q", "", "disabled")
	if err != nil || len(got) != 1 || got[0].ID != issuerID || got[0].Status != "disabled" {
		t.Fatalf("filtered list = %+v %v", got, err)
	}
	got, err = st.ListUsers(t.Context(), "", "admin", "")
	if err != nil || len(got) != 1 || got[0].ID != adminID {
		t.Fatalf("role list = %+v %v", got, err)
	}
	if err := st.UpdateUser(t.Context(), User{ID: 999}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("update missing = %v, want ErrNotFound", err)
	}
}

func TestAdminResetLinks(t *testing.T) {
	st := openT(t)
	issuerID, adminID := seedAdminUsers(t, st)
	now := time.Now().Unix()

	if err := st.CreateResetLink(t.Context(), "tok-h", issuerID, now+3600, adminID); err != nil {
		t.Fatal(err)
	}
	// Unknown tokens, and expired links, are refused with ErrNotFound.
	if _, err := st.ConsumeResetLink(t.Context(), "nope", now); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown = %v", err)
	}
	if err := st.CreateResetLink(t.Context(), "old-h", issuerID, now-1, adminID); err != nil {
		t.Fatal(err)
	}
	if _, err := st.ConsumeResetLink(t.Context(), "old-h", now); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expired = %v", err)
	}
	// A valid token works exactly once, then it is spent.
	id, err := st.ConsumeResetLink(t.Context(), "tok-h", now)
	if err != nil || id != issuerID {
		t.Fatalf("consume = %d %v", id, err)
	}
	if _, err := st.ConsumeResetLink(t.Context(), "tok-h", now); !errors.Is(err, ErrNotFound) {
		t.Fatalf("reuse = %v", err)
	}
	// SetUserPassword is stored.
	if err := st.SetUserPassword(t.Context(), issuerID, "new-hash"); err != nil {
		t.Fatal(err)
	}
	_, hash, _ := st.UserByEmail(t.Context(), "i@q.kz")
	if hash != "new-hash" {
		t.Fatalf("password not set: %q", hash)
	}
}

// Task 9700: ResetPassword consumes the token, sets the hash and kills the
// sessions in one transaction; the token works exactly once.
func TestResetPasswordSingleTransaction(t *testing.T) {
	st := openT(t)
	issuerID, adminID := seedAdminUsers(t, st)
	now := time.Now().Unix()
	if err := st.CreateResetLink(t.Context(), "tx-h", issuerID, now+3600, adminID); err != nil {
		t.Fatal(err)
	}
	if err := st.CreateSession(t.Context(), "sess-h", issuerID, now+3600); err != nil {
		t.Fatal(err)
	}
	id, err := st.ResetPassword(t.Context(), "tx-h", now, "new-hash")
	if err != nil || id != issuerID {
		t.Fatalf("reset = %d %v", id, err)
	}
	if _, hash, _ := st.UserByEmail(t.Context(), "i@q.kz"); hash != "new-hash" {
		t.Fatalf("password not set: %q", hash)
	}
	if _, err := st.SessionUser(t.Context(), "sess-h", now); !errors.Is(err, ErrNoSession) {
		t.Fatalf("session survived reset: %v", err)
	}
	if _, err := st.ResetPassword(t.Context(), "tx-h", now, "again-hash"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("reuse = %v, want ErrNotFound", err)
	}
}

func TestAdminSearchAudit(t *testing.T) {
	st := openT(t)
	issuerID, adminID := seedAdminUsers(t, st)
	rows := []AuditEntry{
		{Ts: 100, UserID: adminID, Role: "admin", Route: "POST /admin/users", Params: []byte(`{"email":"i@q.kz"}`), OK: true, Detail: "user created"},
		{Ts: 200, UserID: issuerID, Role: "issuer", Route: "POST /issuer/series", Params: []byte("{}"), OK: false, Detail: "boom"},
	}
	for _, e := range rows {
		if err := st.InsertAudit(t.Context(), e); err != nil {
			t.Fatal(err)
		}
	}
	all, err := st.SearchAudit(t.Context(), AuditFilter{})
	if err != nil || len(all) != 2 || all[0].Ts != 200 {
		t.Fatalf("all = %+v %v", all, err)
	}
	byEmail, err := st.SearchAudit(t.Context(), AuditFilter{User: "a@q.kz"})
	if err != nil || len(byEmail) != 1 || byEmail[0].Email != "a@q.kz" || byEmail[0].Route != "POST /admin/users" {
		t.Fatalf("by email = %+v %v", byEmail, err)
	}
	byID, err := st.SearchAudit(t.Context(), AuditFilter{User: strconv.FormatInt(issuerID, 10)}) // numeric = user id
	if err != nil || len(byID) != 1 || byID[0].UserID != issuerID || byID[0].Email != "i@q.kz" {
		t.Fatalf("by id = %+v %v", byID, err)
	}
	failed := false
	byOK, err := st.SearchAudit(t.Context(), AuditFilter{OK: &failed, From: 150, Route: "series"})
	if err != nil || len(byOK) != 1 || byOK[0].Detail != "boom" {
		t.Fatalf("by ok+from+route = %+v %v", byOK, err)
	}
	if none, _ := st.SearchAudit(t.Context(), AuditFilter{To: 50}); len(none) != 0 {
		t.Fatalf("to-filter = %+v", none)
	}
}

func TestAdminUpdateOrganization(t *testing.T) {
	st := openT(t)
	o, err := st.CreateOrganization(t.Context(), Organization{Name: "Old", Kind: "issuer"})
	if err != nil {
		t.Fatal(err)
	}
	o.Name, o.Website = "New JSC", "https://new.kz"
	if err := st.UpdateOrganization(t.Context(), o); err != nil {
		t.Fatal(err)
	}
	got, _ := st.GetOrganization(t.Context(), o.ID)
	if got.Name != "New JSC" || got.Website != "https://new.kz" {
		t.Fatalf("org after update = %+v", got)
	}
	if err := st.UpdateOrganization(t.Context(), Organization{ID: 999}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing org = %v, want ErrNotFound", err)
	}
}
