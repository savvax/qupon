package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

// Activity is one decoded on-chain event. SeriesMint holds the series PDA and
// ActionPDA the action PDA from the event payload (nullable: series-level
// events have no action). Payload is the full decoded event as JSON.
type Activity struct {
	ID         int64           `json:"id"`
	Ts         int64           `json:"ts"`
	SeriesMint *string         `json:"series_mint"`
	ActionPDA  *string         `json:"action_pda"`
	Kind       string          `json:"kind"`
	Payload    json.RawMessage `json:"payload"`
	Sig        string          `json:"sig"`
	Slot       uint64          `json:"slot"`
	Seq        int             `json:"seq"`
}

// InsertActivity appends an activity row; INSERT OR IGNORE on (sig, kind, seq)
// makes repeated ingests of the same transaction idempotent. Returns false if
// the row was already present.
func (s *Store) InsertActivity(ctx context.Context, a Activity) (bool, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT OR IGNORE INTO activity (ts, series_mint, action_pda, kind, payload, sig, slot, seq)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		a.Ts, a.SeriesMint, a.ActionPDA, a.Kind, []byte(a.Payload), a.Sig, a.Slot, a.Seq)
	if err != nil {
		return false, fmt.Errorf("insert activity: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("insert activity rows affected: %w", err)
	}
	return n > 0, nil
}

// ListActivity returns the newest `limit` events in chain order (oldest first).
func (s *Store) ListActivity(ctx context.Context, limit int) ([]Activity, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, ts, series_mint, action_pda, kind, payload, sig, slot, seq
		 FROM activity ORDER BY id ASC LIMIT ?`, limit)
	if err != nil {
		return nil, fmt.Errorf("list activity: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var out []Activity
	for rows.Next() {
		var a Activity
		if err := rows.Scan(&a.ID, &a.Ts, &a.SeriesMint, &a.ActionPDA, &a.Kind,
			&a.Payload, &a.Sig, &a.Slot, &a.Seq); err != nil {
			return nil, fmt.Errorf("scan activity: %w", err)
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// IngestCursor returns the persisted newest-processed signature ("" if none).
func (s *Store) IngestCursor(ctx context.Context) (string, error) {
	var cur string
	err := s.db.QueryRowContext(ctx, `SELECT last_sig FROM ingest_state WHERE id = 1`).Scan(&cur)
	if err == sql.ErrNoRows {
		return "", nil
	} else if err != nil {
		return "", fmt.Errorf("read ingest cursor: %w", err)
	}
	return cur, nil
}

// SetIngestCursor persists the newest-processed signature.
func (s *Store) SetIngestCursor(ctx context.Context, sig string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO ingest_state (id, last_sig, updated_at) VALUES (1, ?, unixepoch())
		 ON CONFLICT(id) DO UPDATE SET last_sig = excluded.last_sig, updated_at = excluded.updated_at`, sig)
	if err != nil {
		return fmt.Errorf("set ingest cursor: %w", err)
	}
	return nil
}
