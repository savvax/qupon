// Package store owns the registrar's SQLite database: open, migrate, query.
package store

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	_ "modernc.org/sqlite" // driver registered as "sqlite"

	"github.com/qupon-kz/qupon/services/registrar/migrations"
)

// Store wraps the SQLite handle. Safe for concurrent use (database/sql pools).
type Store struct {
	db *sql.DB
}

// Open opens (creating if needed) the database at path and applies all
// migrations in filename order.
func Open(ctx context.Context, path string) (*Store, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, fmt.Errorf("open sqlite %s: %w", path, err)
	}
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close() // best effort; ping already failed
		return nil, fmt.Errorf("ping sqlite %s: %w", path, err)
	}
	s := &Store{db: db}
	if err := s.migrate(ctx); err != nil {
		_ = db.Close() // best effort; migrate already failed
		return nil, err
	}
	return s, nil
}

// Ping verifies the database connection is alive.

// Ping verifies the database connection is alive.
func (s *Store) Ping(ctx context.Context) error {
	if err := s.db.PingContext(ctx); err != nil {
		return fmt.Errorf("ping: %w", err)
	}
	return nil
}

// Close releases the database handle.
func (s *Store) Close() error { return s.db.Close() }

// SeriesRow is one mirrored Series account.
type SeriesRow struct {
	Mint      string
	Data      []byte // series view JSON, served verbatim by GET /series
	UpdatedAt int64
}

// UpsertSeries mirrors a Series account (keyed by bond mint).
func (s *Store) UpsertSeries(ctx context.Context, mint string, data []byte) error {
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO series (mint, data, updated_at) VALUES (?, ?, unixepoch())
		 ON CONFLICT(mint) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
		mint, string(data)); err != nil {
		return fmt.Errorf("upsert series %s: %w", mint, err)
	}
	return nil
}

// ListSeries returns all mirrored series ordered by mint.
func (s *Store) ListSeries(ctx context.Context) ([]SeriesRow, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT mint, data, updated_at FROM series ORDER BY mint`)
	if err != nil {
		return nil, fmt.Errorf("list series: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var out []SeriesRow
	for rows.Next() {
		var r SeriesRow
		if err := rows.Scan(&r.Mint, &r.Data, &r.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan series: %w", err)
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list series rows: %w", err)
	}
	return out, nil
}

func (s *Store) migrate(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx,
		`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}
	entries, err := fs.Glob(migrations.FS, "*.sql")
	if err != nil {
		return fmt.Errorf("glob migrations: %w", err)
	}
	sort.Strings(entries) // 001_..., 002_... ordering
	for _, name := range entries {
		var one int
		if err := s.db.QueryRowContext(ctx,
			`SELECT 1 FROM schema_migrations WHERE name = ?`, name).Scan(&one); err == nil {
			continue // already applied
		} else if err != sql.ErrNoRows {
			return fmt.Errorf("check migration %s: %w", name, err)
		}
		body, err := migrations.FS.ReadFile(name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		if err := s.applyMigration(ctx, name, string(body)); err != nil {
			return err
		}
	}
	return nil
}

// fkOffMarker opts a migration into SQLite's table-rebuild procedure (https://sqlite.org/lang_altertable.html#otheralter):
// foreign keys off for that migration's connection, so `DROP TABLE` of a referenced table neither fails nor cascades
// into child rows, then `PRAGMA foreign_key_check` before commit. 008 rebuilt `users` with live child rows on production
// (2026-10-10: "FOREIGN KEY constraint failed" — the registrar crash-looped; tests had empty tables).
const fkOffMarker = "-- qupon:foreign_keys=off"

// applyMigration runs one migration in a transaction on a pinned connection (PRAGMAs are per connection).
func (s *Store) applyMigration(ctx context.Context, name, body string) error {
	conn, err := s.db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("conn for migration %s: %w", name, err)
	}
	defer func() { _ = conn.Close() }()
	fkOff := strings.Contains(body, fkOffMarker)
	if fkOff {
		if _, err := conn.ExecContext(ctx, `PRAGMA foreign_keys=OFF`); err != nil {
			return fmt.Errorf("foreign keys off for %s: %w", name, err)
		}
		defer func() { _, _ = conn.ExecContext(context.WithoutCancel(ctx), `PRAGMA foreign_keys=ON`) }()
	}
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx %s: %w", name, err)
	}
	if _, err := tx.ExecContext(ctx, body); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("apply migration %s: %w", name, err)
	}
	if fkOff {
		rows, err := tx.QueryContext(ctx, `PRAGMA foreign_key_check`)
		if err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("foreign key check %s: %w", name, err)
		}
		bad := rows.Next()
		_ = rows.Close()
		if bad {
			_ = tx.Rollback()
			return fmt.Errorf("apply migration %s: foreign key check failed after the rebuild", name)
		}
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO schema_migrations (name, applied_at) VALUES (?, unixepoch())`, name); err != nil {
		_ = tx.Rollback()
		return fmt.Errorf("record migration %s: %w", name, err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit migration %s: %w", name, err)
	}
	return nil
}
