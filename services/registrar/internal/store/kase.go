package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// GetKaseCache returns the last good kase.kz body for a cache key (ok=false when none exists).
func (s *Store) GetKaseCache(ctx context.Context, key string) (body string, fetchedAt int64, ok bool, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT body, fetched_at FROM kase_cache WHERE key = ?`, key).
		Scan(&body, &fetchedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return "", 0, false, nil
	}
	if err != nil {
		return "", 0, false, fmt.Errorf("get kase cache %s: %w", key, err)
	}
	return body, fetchedAt, true, nil
}

// PutKaseCache stores one good kase.kz body; only 200 responses are cached, so status is fixed.
// The caller supplies the fetch timestamp (the service owns a test clock). Every
// put also evicts rows older than 7 days: keys are attacker-walkable codes, so
// the table must not grow without bound (task 1416).
func (s *Store) PutKaseCache(ctx context.Context, key, body string, fetchedAt int64) error {
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO kase_cache (key, body, status, fetched_at) VALUES (?, ?, 200, ?)
		 ON CONFLICT(key) DO UPDATE SET body = excluded.body, status = excluded.status, fetched_at = excluded.fetched_at`,
		key, body, fetchedAt); err != nil {
		return fmt.Errorf("put kase cache %s: %w", key, err)
	}
	cutoff := fetchedAt - int64((7 * 24 * time.Hour).Seconds())
	if _, err := s.db.ExecContext(ctx, `DELETE FROM kase_cache WHERE fetched_at < ?`, cutoff); err != nil {
		return fmt.Errorf("evict kase cache: %w", err)
	}
	return nil
}
