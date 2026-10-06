// System-health queries for GET /admin/system (task 702): kase.kz cache status and demo usage.
package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// KaseStats summarises kase_cache; LastFetch is nil and LastError "" when the cache is empty.
type KaseStats struct {
	Entries   int64
	LastFetch *int64
	LastError string
}

// KaseStats counts cached kase.kz bodies and surfaces the most recent non-OK fetch.
func (s *Store) KaseStats(ctx context.Context) (KaseStats, error) {
	var out KaseStats
	var lastFetch int64
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*), COALESCE(MAX(fetched_at), 0) FROM kase_cache`).
		Scan(&out.Entries, &lastFetch); err != nil {
		return out, fmt.Errorf("kase stats: %w", err)
	}
	if lastFetch > 0 {
		out.LastFetch = &lastFetch
	}
	var status int
	var key string
	err := s.db.QueryRowContext(ctx,
		`SELECT status, key FROM kase_cache WHERE status NOT IN (200, 204) ORDER BY fetched_at DESC LIMIT 1`).
		Scan(&status, &key)
	if err == sql.ErrNoRows {
		return out, nil
	}
	if err != nil {
		return out, fmt.Errorf("kase last error: %w", err)
	}
	out.LastError = fmt.Sprintf("HTTP %d: %s", status, key)
	return out, nil
}

// DemoUsage counts demo-role activity for the admin dashboard: writes this hour (the DemoLimit
// window) and series creations this day (the DemoSeriesLimit window). The audit table is the
// source of truth — the in-memory limiters forget on restart.
type DemoUsage struct {
	WritesPerHour int64 `json:"writesPerHour"`
	SeriesPerDay  int64 `json:"seriesPerDay"`
}

// DemoUsage counts successful demo-user POST audit rows inside the two demo windows.
func (s *Store) DemoUsage(ctx context.Context, now time.Time) (DemoUsage, error) {
	var out DemoUsage
	if err := s.db.QueryRowContext(ctx,
		`SELECT
			(SELECT COUNT(*) FROM audit a JOIN users u ON u.id = a.user_id
			 WHERE u.is_demo = 1 AND a.ok = 1 AND a.route LIKE 'POST /%' AND a.ts >= ?),
			(SELECT COUNT(*) FROM audit a JOIN users u ON u.id = a.user_id
			 WHERE u.is_demo = 1 AND a.ok = 1 AND a.route = 'POST /issuer/series' AND a.ts >= ?)`,
		now.Unix()-int64(time.Hour.Seconds()), now.Unix()-int64((24*time.Hour).Seconds())).
		Scan(&out.WritesPerHour, &out.SeriesPerDay); err != nil {
		return out, fmt.Errorf("demo usage: %w", err)
	}
	return out, nil
}
