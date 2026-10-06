package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

// Notification is one in-app notice (task 805); rows are written only through Store.Notify.
type Notification struct {
	ID        int64           `json:"id"`
	Kind      string          `json:"kind"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt int64           `json:"createdAt"`
	ReadAt    *int64          `json:"readAt"`
}

// ListNotifications returns the user's notifications, newest first (limit clamped to 1..200).
func (s *Store) ListNotifications(ctx context.Context, userID int64, unreadOnly bool, limit int) ([]Notification, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	q := `SELECT id, kind, payload, created_at, read_at FROM notifications WHERE user_id = ?`
	if unreadOnly {
		q += ` AND read_at IS NULL`
	}
	rows, err := s.db.QueryContext(ctx, q+` ORDER BY created_at DESC, id DESC LIMIT ?`, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("list notifications: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := []Notification{}
	for rows.Next() {
		var n Notification
		var payload string
		var readAt sql.NullInt64
		if err := rows.Scan(&n.ID, &n.Kind, &payload, &n.CreatedAt, &readAt); err != nil {
			return nil, fmt.Errorf("scan notification: %w", err)
		}
		n.Payload = json.RawMessage(payload)
		if readAt.Valid {
			n.ReadAt = &readAt.Int64
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// UnreadNotifications counts the user's unread notifications (the bell badge).
func (s *Store) UnreadNotifications(ctx context.Context, userID int64) (int, error) {
	var n int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL`, userID).Scan(&n); err != nil {
		return 0, fmt.Errorf("count notifications: %w", err)
	}
	return n, nil
}

// MarkNotificationsRead marks the given ids (or all, when all is true) of this user as read; other users' ids
// are ignored. Returns how many rows changed.
func (s *Store) MarkNotificationsRead(ctx context.Context, userID int64, ids []int64, all bool) (int64, error) {
	q := `UPDATE notifications SET read_at = unixepoch() WHERE user_id = ? AND read_at IS NULL`
	args := []any{userID}
	if !all {
		if len(ids) == 0 {
			return 0, nil
		}
		q += ` AND id IN (?` + strings.Repeat(",?", len(ids)-1) + `)`
		for _, id := range ids {
			args = append(args, id)
		}
	}
	res, err := s.db.ExecContext(ctx, q, args...)
	if err != nil {
		return 0, fmt.Errorf("mark notifications read: %w", err)
	}
	return res.RowsAffected()
}

// SeriesHolderUsers is the investors read model for fan-out: users with a linked wallet that the ingested activity
// shows as registered in, subscribed to or issued units of the series (by series PDA or mint, as events name it).
func (s *Store) SeriesHolderUsers(ctx context.Context, series string) ([]int64, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT DISTINCT w.user_id FROM activity a
		JOIN wallets w ON w.address = json_extract(a.payload, '$.owner')
		WHERE a.series_mint = ? AND a.kind IN ('InvestorRegistered', 'Subscribed', 'UnitsIssued', 'HolderSnapshotted')
		ORDER BY w.user_id`, series)
	if err != nil {
		return nil, fmt.Errorf("series holders: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan holder: %w", err)
		}
		out = append(out, id)
	}
	return out, rows.Err()
}
