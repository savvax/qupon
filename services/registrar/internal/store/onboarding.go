package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// Onboarding readers (platform v2 §5.3, task 808): the investor checklist on /investor asks
// "has this account used the devnet faucet?" and "has any of its wallets ever subscribed?".

// FaucetUsed reports whether the user has at least one successful faucet write (audit trail).
func (s *Store) FaucetUsed(ctx context.Context, userID int64) (bool, error) {
	var one int
	err := s.db.QueryRowContext(ctx,
		`SELECT 1 FROM audit WHERE user_id = ? AND route = 'POST /me/faucet' AND ok = 1 LIMIT 1`,
		userID).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	} else if err != nil {
		return false, fmt.Errorf("faucet used: %w", err)
	}
	return true, nil
}

// OwnersSubscribed reports whether any of the wallet addresses appears in a Subscribed event
// (activity mirror of the on-chain primary placement).
func (s *Store) OwnersSubscribed(ctx context.Context, owners []string) (bool, error) {
	if len(owners) == 0 {
		return false, nil
	}
	placeholders := strings.TrimRight(strings.Repeat("?,", len(owners)), ",")
	args := make([]any, len(owners))
	for i, o := range owners {
		args[i] = o
	}
	var one int
	err := s.db.QueryRowContext(ctx,
		`SELECT 1 FROM activity WHERE kind = 'Subscribed' AND json_extract(payload, '$.owner') IN (`+
			placeholders+`) LIMIT 1`, args...).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	} else if err != nil {
		return false, fmt.Errorf("owners subscribed: %w", err)
	}
	return true, nil
}
