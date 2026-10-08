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
// the exact qupon CLI argv to run on approve.
// Status: pending | running | executed | rejected | stale.
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

// InsertApproval appends a proposal; dedup_key is unique among *pending* rows (migration 004), so repeated ticks
// don't stack duplicates, while a batch step that must run again after an executed approval can be re-proposed.
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

// ClaimApproval atomically moves a pending row to running so two concurrent
// approve clicks cannot both execute the CLI. false = the row is missing or
// not pending (the caller answers 404/409).
func (s *Store) ClaimApproval(ctx context.Context, id int64) (bool, error) {
	res, err := s.db.ExecContext(ctx,
		`UPDATE approvals SET status = 'running' WHERE id = ? AND status = 'pending'`, id)
	if err != nil {
		return false, fmt.Errorf("claim approval %d: %w", id, err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("claim approval %d rows: %w", id, err)
	}
	return n == 1, nil
}

// RevertApproval puts a failed run back to pending so the human can retry.
// If the scheduler re-proposed the same dedup key while the CLI was running,
// the pending-unique index (migration 004) rejects the revert; a fresh
// pending row already exists then, so this row is superseded → stale.
func (s *Store) RevertApproval(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE OR IGNORE approvals SET status = 'pending' WHERE id = ? AND status = 'running'`, id)
	if err != nil {
		return fmt.Errorf("revert approval %d: %w", id, err)
	}
	if n, _ := res.RowsAffected(); n == 1 {
		return nil
	}
	_, err = s.db.ExecContext(ctx,
		`UPDATE approvals SET status = 'stale' WHERE id = ? AND status = 'running'`, id)
	if err != nil {
		return fmt.Errorf("stale superseded approval %d: %w", id, err)
	}
	return nil
}

// RejectApproval moves a pending row to rejected (registrar decision;
// nothing executes). false = not pending (or missing) → 404/409.
func (s *Store) RejectApproval(ctx context.Context, id int64) (bool, error) {
	res, err := s.db.ExecContext(ctx,
		`UPDATE approvals SET status = 'rejected' WHERE id = ? AND status = 'pending'`, id)
	if err != nil {
		return false, fmt.Errorf("reject approval %d: %w", id, err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("reject approval %d rows: %w", id, err)
	}
	return n == 1, nil
}

// StaleApproval retires a pending proposal the scheduler no longer wants
// (superseded decision, or an announce whose record date passed unapproved).
func (s *Store) StaleApproval(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE approvals SET status = 'stale' WHERE id = ? AND status = 'pending'`, id)
	if err != nil {
		return fmt.Errorf("stale approval %d: %w", id, err)
	}
	return nil
}

// PendingSeriesApprovals lists the pending rows of one series (scheduler stale sweep).
func (s *Store) PendingSeriesApprovals(ctx context.Context, seriesMint string) ([]Approval, error) {
	rows, err := s.ListApprovals(ctx, "pending")
	if err != nil {
		return nil, err
	}
	var out []Approval
	for _, a := range rows {
		if a.SeriesMint == seriesMint {
			out = append(out, a)
		}
	}
	return out, nil
}
