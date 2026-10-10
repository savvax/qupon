package store

import (
	"database/sql"
	"errors"
	"path/filepath"
	"sort"
	"testing"

	"github.com/qupon-kz/qupon/services/registrar/migrations"
)

// A v5 database (users with the old role CHECK, a live session) upgrades in place: users keep their ids and
// become active, the investor role is accepted, and old sessions are dropped by the table rebuild.
func TestMigration006UpgradesUsers(t *testing.T) {
	path := filepath.Join(t.TempDir(), "v5.db")
	db, err := sql.Open("sqlite", path+"?_pragma=foreign_keys(1)")
	if err != nil {
		t.Fatal(err)
	}
	names, _ := migrations.FS.ReadDir(".")
	var files []string
	for _, n := range names {
		if n.Name() < "006" {
			files = append(files, n.Name())
		}
	}
	sort.Strings(files)
	if _, err := db.Exec(`CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	for _, f := range files {
		body, _ := migrations.FS.ReadFile(f)
		if _, err := db.Exec(string(body)); err != nil {
			t.Fatalf("%s: %v", f, err)
		}
		if _, err := db.Exec(`INSERT INTO schema_migrations VALUES (?, 0)`, f); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(`INSERT INTO users (id, email, name, role, password_hash, is_demo, created_at)
		VALUES (7, 'r@q.kz', 'Reg', 'registrar', 'h', 0, 1)`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO sessions VALUES ('th', 7, 9999999999)`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()

	st, err := Open(t.Context(), path)
	if err != nil {
		t.Fatalf("open v5: %v", err)
	}
	defer func() { _ = st.Close() }()
	u, _, err := st.UserByEmail(t.Context(), "r@q.kz")
	if err != nil || u.ID != 7 || u.Status != "active" || u.Locale != "en" || u.OrgID != nil {
		t.Fatalf("migrated user = %+v %v", u, err)
	}
	if _, err := st.SessionUser(t.Context(), "th", 1); !errors.Is(err, ErrNoSession) {
		t.Fatalf("old session survived the rebuild: %v", err)
	}
	if _, err := st.UpsertUser(t.Context(), User{Email: "inv@q.kz", Name: "Inv", Role: "investor"}, "h"); err != nil {
		t.Fatalf("investor role rejected: %v", err)
	}
}

func TestDisabledUserHasNoSession(t *testing.T) {
	st := openT(t)
	id, _ := st.UpsertUser(t.Context(), User{Email: "i@q.kz", Name: "I", Role: "issuer"}, "h")
	if err := st.CreateSession(t.Context(), "th", id, 100); err != nil {
		t.Fatal(err)
	}
	if _, err := st.db.Exec(`UPDATE users SET status = 'disabled' WHERE id = ?`, id); err != nil {
		t.Fatal(err)
	}
	if _, err := st.SessionUser(t.Context(), "th", 1); !errors.Is(err, ErrNoSession) {
		t.Fatalf("disabled user kept a session: %v", err)
	}
}

func TestOrganizationsAndUserOrg(t *testing.T) {
	st := openT(t)
	o, err := st.CreateOrganization(t.Context(), Organization{Name: "Demo Issuer JSC", Kind: "issuer"})
	if err != nil || o.ID == 0 || o.Kind != "issuer" {
		t.Fatalf("create = %+v %v", o, err)
	}
	if _, err := st.CreateOrganization(t.Context(), Organization{Name: "X", Kind: "bank"}); err == nil {
		t.Fatal("kind outside the CHECK accepted")
	}
	if got, err := st.OrganizationByName(t.Context(), "Demo Issuer JSC"); err != nil || got.ID != o.ID {
		t.Fatalf("by name = %+v %v", got, err)
	}
	if _, err := st.GetOrganization(t.Context(), 999); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing org err = %v", err)
	}
	id, _ := st.UpsertUser(t.Context(), User{Email: "i@q.kz", Name: "I", Role: "issuer"}, "h")
	if err := st.SetUserOrg(t.Context(), id, &o.ID); err != nil {
		t.Fatal(err)
	}
	u, _, _ := st.UserByEmail(t.Context(), "i@q.kz")
	if u.OrgID == nil || *u.OrgID != o.ID {
		t.Fatalf("org not set: %+v", u)
	}
	list, err := st.ListOrganizations(t.Context())
	if err != nil || len(list) != 1 {
		t.Fatalf("list = %+v %v", list, err)
	}
}

func TestCashAssets(t *testing.T) {
	st := openT(t)
	freeze := "Frz1111111111111111111111111111111111111111"
	a := CashAsset{Network: "devnet", Mint: "M1", Symbol: "tKZT", Name: "Test tenge", Decimals: 2,
		TokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", Kind: "test", FreezeAuthority: &freeze, Enabled: true}
	if err := st.InsertCashAssetIfMissing(t.Context(), a); err != nil {
		t.Fatal(err)
	}
	a.Symbol = "CHANGED"
	if err := st.InsertCashAssetIfMissing(t.Context(), a); err != nil {
		t.Fatal(err)
	}
	got, err := st.GetCashAsset(t.Context(), "devnet", "M1")
	if err != nil || got.Symbol != "tKZT" || got.FreezeAuthority == nil || *got.FreezeAuthority != freeze || !got.Enabled {
		t.Fatalf("preset overwritten or lost: %+v %v", got, err)
	}
	if err := st.UpsertCashAsset(t.Context(), CashAsset{Network: "devnet", Mint: "M2", Symbol: "USDC", Name: "USD Coin",
		Decimals: 6, TokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", Kind: "stablecoin"}); err != nil {
		t.Fatal(err)
	}
	all, _ := st.ListCashAssets(t.Context(), "devnet", false)
	enabled, _ := st.ListCashAssets(t.Context(), "devnet", true)
	other, _ := st.ListCashAssets(t.Context(), "mainnet-beta", false)
	if len(all) != 2 || len(enabled) != 1 || enabled[0].Mint != "M1" || len(other) != 0 {
		t.Fatalf("lists: all=%d enabled=%+v other=%d", len(all), enabled, len(other))
	}
	if _, err := st.GetCashAsset(t.Context(), "mainnet-beta", "M1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("network isolation: %v", err)
	}
}

func TestSeriesSettings(t *testing.T) {
	st := openT(t)
	if x, err := st.GetSeriesSettings(t.Context(), "S1"); err != nil || x.Hidden || x.SeriesMint != "S1" {
		t.Fatalf("zero value = %+v %v", x, err)
	}
	if err := st.HideSeriesIfUnset(t.Context(), "S1"); err != nil {
		t.Fatal(err)
	}
	if err := st.UpsertSeriesSettings(t.Context(), SeriesSettings{SeriesMint: "S2", KaseTicker: "TEBNb10"}); err != nil {
		t.Fatal(err)
	}
	if err := st.HideSeriesIfUnset(t.Context(), "S2"); err != nil { // admin row exists: import must not hide it
		t.Fatal(err)
	}
	m, err := st.ListSeriesSettings(t.Context())
	if err != nil || !m["S1"].Hidden || m["S2"].Hidden || m["S2"].KaseTicker != "TEBNb10" {
		t.Fatalf("settings = %+v %v", m, err)
	}
}

func TestNotifyIsIdempotent(t *testing.T) {
	st := openT(t)
	id, _ := st.UpsertUser(t.Context(), User{Email: "m@q.kz", Name: "M", Role: "investor"}, "h")
	for range 2 {
		if err := st.Notify(t.Context(), id, "kyc_decision", map[string]string{"status": "approved"}, "kyc:1"); err != nil {
			t.Fatal(err)
		}
	}
	var n int
	if err := st.db.QueryRow(`SELECT COUNT(*) FROM notifications WHERE user_id = ?`, id).Scan(&n); err != nil || n != 1 {
		t.Fatalf("notifications = %d %v", n, err)
	}
}

// Migration 008 (task 91522): the users table admits the paying_agent role and the kk locale — account.go accepted
// "kk" but the 006 CHECK refused the write.
func TestUsersAdmitPayingAgentAndKazakh(t *testing.T) {
	st := openT(t)
	ctx := t.Context()
	id, err := st.UpsertUser(ctx, User{Email: "agent@test.kz", Name: "Agent", Role: "paying_agent"}, "x")
	if err != nil {
		t.Fatalf("paying_agent user: %v", err)
	}
	if err := st.UpdateProfile(ctx, id, "Агент", "kk"); err != nil {
		t.Fatalf("kk locale: %v", err)
	}
}

// Production regression (2026-10-10): 008 rebuilds `users` while child tables hold rows — with foreign keys on, the
// DROP failed ("FOREIGN KEY constraint failed") and the registrar crash-looped; with ON DELETE CASCADE it would have
// wiped wallets and sessions. Re-applying 008 over live child rows must succeed and keep every child row.
func TestMigration008RebuildKeepsChildRows(t *testing.T) {
	st := openT(t)
	ctx := t.Context()
	uid, err := st.UpsertUser(ctx, User{Email: "holder@test.kz", Name: "Holder", Role: "investor"}, "x")
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('h1', ?, 9999999999)`,
		`INSERT INTO wallets (address, user_id, verified_at) VALUES ('W1', ?, 1)`,
		`INSERT INTO kyc_applications (user_id, wallet, investor_type, residency, tax_bps, full_name, created_at) VALUES (?, 'W1', 'individual', 'resident', 1000, 'H', 1)`,
	} {
		if _, err := st.db.ExecContext(ctx, q, uid); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	if _, err := st.db.ExecContext(ctx, `DELETE FROM schema_migrations WHERE name = '008_paying_agent.sql'`); err != nil {
		t.Fatal(err)
	}
	if err := st.migrate(ctx); err != nil {
		t.Fatalf("re-apply 008 over child rows: %v", err)
	}
	for _, table := range []string{"sessions", "wallets", "kyc_applications"} {
		var n int
		if err := st.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM `+table+` WHERE user_id = ?`, uid).Scan(&n); err != nil || n != 1 {
			t.Fatalf("%s rows after 008 = %d (%v), want 1", table, n, err)
		}
	}
	var fkOn int
	if err := st.db.QueryRowContext(ctx, `PRAGMA foreign_keys`).Scan(&fkOn); err != nil || fkOn != 1 {
		t.Fatalf("foreign keys after migration = %d (%v), want 1", fkOn, err)
	}
}
