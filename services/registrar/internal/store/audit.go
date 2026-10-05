package store

import (
	"context"
	"encoding/json"
	"fmt"
)

// AuditEntry is one row per authenticated write: who ran what with which
// params, whether it succeeded, and the resulting transaction signatures.
type AuditEntry struct {
	ID         int64
	Ts         int64
	UserID     int64
	Role       string
	Route      string
	Params     json.RawMessage
	OK         bool
	Detail     string
	Signatures []string
}

// InsertAudit appends an audit row; signatures are stored as a JSON array.
func (s *Store) InsertAudit(ctx context.Context, e AuditEntry) error {
	params := "null"
	if len(e.Params) > 0 {
		params = string(e.Params)
	}
	sigs, err := json.Marshal(e.Signatures)
	if err != nil {
		return fmt.Errorf("audit signatures: %w", err)
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO audit (ts, user_id, role, route, params, ok, detail, signatures)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		e.Ts, e.UserID, e.Role, e.Route, params, e.OK, e.Detail, string(sigs)); err != nil {
		return fmt.Errorf("insert audit: %w", err)
	}
	return nil
}

// ListAudit returns the newest `limit` audit rows, newest first.
func (s *Store) ListAudit(ctx context.Context, limit int) ([]AuditEntry, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, ts, user_id, role, route, params, ok, detail, signatures
		 FROM audit ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, fmt.Errorf("list audit: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var out []AuditEntry
	for rows.Next() {
		var e AuditEntry
		var ok int
		var params, sigs string
		if err := rows.Scan(&e.ID, &e.Ts, &e.UserID, &e.Role, &e.Route,
			&params, &ok, &e.Detail, &sigs); err != nil {
			return nil, fmt.Errorf("scan audit: %w", err)
		}
		e.Params = json.RawMessage(params)
		e.OK = ok != 0
		if err := json.Unmarshal([]byte(sigs), &e.Signatures); err != nil {
			return nil, fmt.Errorf("decode audit signatures: %w", err)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
