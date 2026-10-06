package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
)

// Wallet errors.
var (
	ErrWalletTaken     = errors.New("wallet linked to another user")
	ErrNoChallenge     = errors.New("no valid wallet challenge")
	ErrChallengeExists = errors.New("challenge nonce collision")
)

// Wallet is a Solana address a user proved to control (signed a server challenge).
type Wallet struct {
	Address    string `json:"address"`
	UserID     int64  `json:"-"`
	Label      string `json:"label"`
	VerifiedAt int64  `json:"verifiedAt"`
}

// WalletChallenge is an issued, not yet used link challenge.
type WalletChallenge struct {
	Nonce     string
	UserID    int64
	Address   string
	ExpiresAt int64
}

// CreateWalletChallenge stores a single-use nonce bound to one user and one address.
func (s *Store) CreateWalletChallenge(ctx context.Context, c WalletChallenge) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM wallet_challenges WHERE expires_at < unixepoch()`); err != nil {
		return fmt.Errorf("prune wallet challenges: %w", err)
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO wallet_challenges (nonce, user_id, address, expires_at) VALUES (?, ?, ?, ?)`,
		c.Nonce, c.UserID, c.Address, c.ExpiresAt); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return ErrChallengeExists
		}
		return fmt.Errorf("create wallet challenge: %w", err)
	}
	return nil
}

// LatestWalletChallenge returns the newest unused, unexpired challenge of a user for an address.
func (s *Store) LatestWalletChallenge(ctx context.Context, userID int64, address string, now int64) (WalletChallenge, error) {
	var c WalletChallenge
	err := s.db.QueryRowContext(ctx,
		`SELECT nonce, user_id, address, expires_at FROM wallet_challenges
		 WHERE user_id = ? AND address = ? AND used_at IS NULL AND expires_at > ?
		 ORDER BY expires_at DESC LIMIT 1`, userID, address, now).
		Scan(&c.Nonce, &c.UserID, &c.Address, &c.ExpiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return WalletChallenge{}, ErrNoChallenge
	} else if err != nil {
		return WalletChallenge{}, fmt.Errorf("wallet challenge: %w", err)
	}
	return c, nil
}

// LinkWallet consumes the challenge and stores the wallet in one transaction. Linking an address the user
// already owns succeeds; an address owned by someone else fails with ErrWalletTaken (the challenge stays unused).
func (s *Store) LinkWallet(ctx context.Context, nonce string, w Wallet) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin link wallet: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	var owner int64
	switch err := tx.QueryRowContext(ctx, `SELECT user_id FROM wallets WHERE address = ?`, w.Address).Scan(&owner); {
	case err == nil && owner != w.UserID:
		return ErrWalletTaken
	case err != nil && !errors.Is(err, sql.ErrNoRows):
		return fmt.Errorf("wallet owner: %w", err)
	}
	res, err := tx.ExecContext(ctx,
		`UPDATE wallet_challenges SET used_at = ? WHERE nonce = ? AND user_id = ? AND address = ? AND used_at IS NULL`,
		w.VerifiedAt, nonce, w.UserID, w.Address)
	if err != nil {
		return fmt.Errorf("use wallet challenge: %w", err)
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ErrNoChallenge
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO wallets (address, user_id, label, verified_at) VALUES (?, ?, ?, ?)
		 ON CONFLICT(address) DO UPDATE SET verified_at = excluded.verified_at`,
		w.Address, w.UserID, w.Label, w.VerifiedAt); err != nil {
		return fmt.Errorf("insert wallet: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit link wallet: %w", err)
	}
	return nil
}

// ListWallets returns a user's verified wallets, oldest first (the first one is the default payout wallet).
func (s *Store) ListWallets(ctx context.Context, userID int64) ([]Wallet, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT address, user_id, label, verified_at FROM wallets WHERE user_id = ? ORDER BY verified_at, address`, userID)
	if err != nil {
		return nil, fmt.Errorf("list wallets: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := []Wallet{}
	for rows.Next() {
		var w Wallet
		if err := rows.Scan(&w.Address, &w.UserID, &w.Label, &w.VerifiedAt); err != nil {
			return nil, fmt.Errorf("scan wallet: %w", err)
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

// WalletOwner returns the user id that linked an address (ErrNotFound if nobody did).
func (s *Store) WalletOwner(ctx context.Context, address string) (int64, error) {
	var id int64
	err := s.db.QueryRowContext(ctx, `SELECT user_id FROM wallets WHERE address = ?`, address).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrNotFound
	} else if err != nil {
		return 0, fmt.Errorf("wallet owner: %w", err)
	}
	return id, nil
}

// DeleteWallet unlinks one of the user's wallets (ErrNotFound when it is not theirs).
func (s *Store) DeleteWallet(ctx context.Context, userID int64, address string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM wallets WHERE user_id = ? AND address = ?`, userID, address)
	if err != nil {
		return fmt.Errorf("delete wallet: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
