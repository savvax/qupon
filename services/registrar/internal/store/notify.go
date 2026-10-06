package store

import (
	"context"
	"encoding/json"
	"fmt"
)

// Notify adds an in-app notification for a user. dedupKey makes it idempotent per user (replaying the same
// event or decision adds nothing). Readers and fan-out live with task 805; this is the one writer.
func (s *Store) Notify(ctx context.Context, userID int64, kind string, payload any, dedupKey string) error {
	p, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("notification payload: %w", err)
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO notifications (user_id, kind, payload, dedup_key, created_at) VALUES (?, ?, ?, ?, unixepoch())
		 ON CONFLICT(user_id, dedup_key) DO NOTHING`, userID, kind, string(p), dedupKey); err != nil {
		return fmt.Errorf("notify: %w", err)
	}
	return nil
}
