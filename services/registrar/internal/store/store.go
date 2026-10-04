// Package store owns the registrar's SQLite database: open, migrate, query.
package store

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"sort"

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
		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin tx %s: %w", name, err)
		}
		if _, err := tx.ExecContext(ctx, string(body)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO schema_migrations (name, applied_at) VALUES (?, unixepoch())`, name); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("record migration %s: %w", name, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", name, err)
		}
	}
	return nil
}
