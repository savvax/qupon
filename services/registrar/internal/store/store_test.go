package store

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"testing"
)

func TestOpenMigratesAndPersists(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "test.db")

	st, err := Open(ctx, path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	if _, err := st.db.ExecContext(ctx,
		`INSERT INTO series (mint, data, updated_at) VALUES ('mint1', '{}', 1)`); err != nil {
		t.Fatalf("insert series: %v", err)
	}
	if _, err := st.db.ExecContext(ctx,
		`INSERT INTO actions (pda, series_mint, data, updated_at) VALUES ('pda1', 'mint1', '{}', 1)`); err != nil {
		t.Fatalf("insert actions: %v", err)
	}
	if _, err := st.db.ExecContext(ctx,
		`INSERT INTO entitlements (pda, action_pda, data, updated_at) VALUES ('ent1', 'pda1', '{}', 1)`); err != nil {
		t.Fatalf("insert entitlements: %v", err)
	}
	if _, err := st.db.ExecContext(ctx,
		`INSERT INTO activity (ts, series_mint, action_pda, kind, payload) VALUES (1, 'mint1', 'pda1', 'Subscribed', '{}')`); err != nil {
		t.Fatalf("insert activity: %v", err)
	}
	if _, err := st.db.ExecContext(ctx,
		`INSERT INTO runs (ts, action_pda, step, status, detail) VALUES (1, 'pda1', 'pay', 'ok', '')`); err != nil {
		t.Fatalf("insert runs: %v", err)
	}
	if err := st.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	// Re-opening applies no new migrations and keeps the data.
	st2, err := Open(ctx, path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer func() { _ = st2.Close() }()
	var n int
	if err := st2.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM series`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("series count = %d, want 1", n)
	}
}

func TestPing(t *testing.T) {
	st, err := Open(context.Background(), filepath.Join(t.TempDir(), "ping.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer func() { _ = st.Close() }()
	if err := st.Ping(context.Background()); err != nil {
		t.Fatalf("ping: %v", err)
	}
}
func TestListActivityReturnsNewestRows(t *testing.T) {
	ctx := context.Background()
	st, err := Open(ctx, filepath.Join(t.TempDir(), "activity.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer func() { _ = st.Close() }()

	const limit = 5
	for i := 1; i <= limit+1; i++ { // insert one row more than the limit
		if _, err := st.InsertActivity(ctx, Activity{
			Ts: int64(i), Kind: "Subscribed", Sig: fmt.Sprintf("sig%d", i), Slot: uint64(i),
			Payload: json.RawMessage(`{"units":"1"}`),
		}); err != nil {
			t.Fatalf("insert %d: %v", i, err)
		}
	}

	rows, err := st.ListActivity(ctx, limit)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rows) != limit {
		t.Fatalf("rows = %d, want %d", len(rows), limit)
	}
	// chain order (oldest first) and the NEWEST `limit` rows, not the oldest
	for i, row := range rows {
		want := fmt.Sprintf("sig%d", i+2)
		if row.Sig != want {
			t.Errorf("rows[%d].Sig = %s, want %s (oldest row must be dropped)", i, row.Sig, want)
		}
	}
}
