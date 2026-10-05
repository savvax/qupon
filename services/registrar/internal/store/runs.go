package store

import (
	"context"
	"fmt"
)

// Run is one recorded registrar operation: a reconcile report, an executor
// step, a scheduler tick. Detail carries the JSON payload.
type Run struct {
	ID        int64  `json:"id"`
	Ts        int64  `json:"ts"`
	ActionPDA string `json:"action_pda"`
	Step      string `json:"step"`
	Status    string `json:"status"`
	Detail    string `json:"detail"`
}

// InsertRun appends a run row.
func (s *Store) InsertRun(ctx context.Context, r Run) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO runs (ts, action_pda, step, status, detail) VALUES (?, ?, ?, ?, ?)`,
		r.Ts, r.ActionPDA, r.Step, r.Status, r.Detail)
	if err != nil {
		return fmt.Errorf("insert run: %w", err)
	}
	return nil
}
