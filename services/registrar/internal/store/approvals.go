package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

// ErrNoApproval is returned when the id does not exist.
var ErrNoApproval = errors.New("no approval row")

// Approval is one scheduler proposal awaiting a human decision (task 024):
// the exact qupon CLI argv to run on approve. Status: pending | executed.
type Approval struct {
	ID         int64           `json:"id"`
	Ts         int64           `json:"ts"`
	DedupKey   string          `json:"dedupKey"`
	SeriesMint string          `json:"seriesMint"`
	ActionPDA  string          `json:"actionPda"` // "" for announce decisions
	Step       string          `json:"step"`
	Args       []string        `json:"args"`
	Status     string          `json:"status"`
	Detail     json.RawMessage `json:"detail"`
}

// InsertApproval appends a proposal; the dedup_key UNIQUE constraint makes
// repeated ticks idempotent (an executed row is never re-inserted).
func (s *Store) InsertApproval(ctx context.Context, a Approval) error {
	args, err := json.Marshal(a.Args)
	if err != nil {
		return fmt.Errorf("marshal approval args: %w", err)
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT OR IGNORE INTO approvals (ts, dedup_key, series_mint, action_pda, step, args, status)
		 VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
		a.Ts, a.DedupKey, a.SeriesMint, a.ActionPDA, a.Step, string(args))
	if err != nil {
		return fmt.Errorf("insert approval: %w", err)
	}
	return nil
}

// ListApprovals returns rows filtered by status ("" = any), oldest first.
func (s *Store) ListApprovals(ctx context.Context, status string) ([]Approval, error) {
	q := `SELECT id, ts, dedup_key, series_mint, action_pda, step, args, status, detail
	      FROM approvals`
	var args []any
	if status != "" {
		q += ` WHERE status = ?`
		args = append(args, status)
	}
	q += ` ORDER BY id ASC LIMIT 500`
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("list approvals: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var out []Approval
	for rows.Next() {
		var a Approval
		var raw, pda, detail sql.NullString
		if err := rows.Scan(&a.ID, &a.Ts, &a.DedupKey, &a.SeriesMint, &pda, &a.Step, &raw, &a.Status, &detail); err != nil {
			return nil, fmt.Errorf("scan approval: %w", err)
		}
		a.ActionPDA = pda.String
		if detail.Valid && detail.String != "" {
			a.Detail = json.RawMessage(detail.String)
		}
		if raw.Valid {
			if err := json.Unmarshal([]byte(raw.String), &a.Args); err != nil {
				return nil, fmt.Errorf("unmarshal approval args: %w", err)
			}
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ApprovalByID loads one row.
func (s *Store) ApprovalByID(ctx context.Context, id int64) (Approval, error) {
	var a Approval
	var raw, pda, detail sql.NullString
	err := s.db.QueryRowContext(ctx,
		`SELECT id, ts, dedup_key, series_mint, action_pda, step, args, status, detail
		 FROM approvals WHERE id = ?`, id).
		Scan(&a.ID, &a.Ts, &a.DedupKey, &a.SeriesMint, &pda, &a.Step, &raw, &a.Status, &detail)
	if errors.Is(err, sql.ErrNoRows) {
		return a, ErrNoApproval
	} else if err != nil {
		return a, fmt.Errorf("approval %d: %w", id, err)
	}
	a.ActionPDA = pda.String
	if detail.Valid && detail.String != "" {
		a.Detail = json.RawMessage(detail.String)
	}
	if raw.Valid {
		if err := json.Unmarshal([]byte(raw.String), &a.Args); err != nil {
			return a, fmt.Errorf("unmarshal approval args: %w", err)
		}
	}
	return a, nil
}

// FinishApproval marks a proposal executed with the CLI result as detail.
func (s *Store) FinishApproval(ctx context.Context, id int64, detail string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE approvals SET status = 'executed', detail = ? WHERE id = ?`, detail, id)
	if err != nil {
		return fmt.Errorf("finish approval %d: %w", id, err)
	}
	return nil
}
