package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

// Sandbox is one judge sandbox (task 1524): the demo series a visitor created on a demo clock, its labelled
// holders, the scenarios run against it and the visitor-wallet claim window (see migration 009).
type Sandbox struct {
	ID          string          `json:"id"`
	RequestID   string          `json:"requestId"`
	IP          string          `json:"ip"`
	Ticker      string          `json:"ticker"`
	Mint        string          `json:"mint"`
	Wallet      string          `json:"wallet"` // the visitor's wallet when POST /demo/sandbox carried one
	Holders     []SandboxHolder `json:"holders"`
	CreatedAt   int64           `json:"createdAt"`
	ExpiresAt   int64           `json:"expiresAt"`
	SkipFunding bool            `json:"skipFunding"` // scenario skip_funding: the autopilot does not fund the next coupon
	ClaimIndex  uint32          `json:"claimIndex"`  // action index the claim window is armed for (0 + ClaimUntil 0 = unarmed)
	ClaimUntil  int64           `json:"claimUntil"`  // unix ts until which the visitor's payout is left for their Claim
}

// SandboxHolder labels one custodial demo investor or the visitor's wallet (the sandboxes.holders JSON column).
// Keypair paths never go into the database — the service re-derives them from its env config by owner.
type SandboxHolder struct {
	Owner      string `json:"owner"`
	Label      string `json:"label"`
	Units      uint64 `json:"units"`
	Route      string `json:"route"` // wallet | bank (bank = paid to the paying agent, transfer SIMULATED)
	TaxRateBps int    `json:"taxRateBps"`
	Kind       string `json:"kind"` // demo | wallet
}

const sandboxCols = `id, request_id, ip, ticker, mint, wallet, holders, created_at, expires_at, skip_funding, claim_index, claim_until`

func scanSandbox(row interface{ Scan(...any) error }) (*Sandbox, error) {
	var x Sandbox
	var holders []byte
	if err := row.Scan(&x.ID, &x.RequestID, &x.IP, &x.Ticker, &x.Mint, &x.Wallet, &holders,
		&x.CreatedAt, &x.ExpiresAt, &x.SkipFunding, &x.ClaimIndex, &x.ClaimUntil); err != nil {
		return nil, err
	}
	x.Holders = []SandboxHolder{} // never nil: the API always renders an array
	if len(holders) > 0 {
		if err := json.Unmarshal(holders, &x.Holders); err != nil {
			return nil, fmt.Errorf("parse holders of sandbox %s: %w", x.ID, err)
		}
	}
	return &x, nil
}

// InsertSandbox stores a just-created sandbox.
func (s *Store) InsertSandbox(ctx context.Context, x Sandbox) error {
	holders, err := json.Marshal(x.Holders)
	if err != nil {
		return fmt.Errorf("marshal sandbox holders: %w", err)
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO sandboxes (`+sandboxCols+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		x.ID, x.RequestID, x.IP, x.Ticker, x.Mint, x.Wallet, string(holders),
		x.CreatedAt, x.ExpiresAt, x.SkipFunding, x.ClaimIndex, x.ClaimUntil); err != nil {
		return fmt.Errorf("insert sandbox %s: %w", x.ID, err)
	}
	return nil
}

// SandboxByID returns the sandbox, or nil when unknown (or expired — the API then answers 404).
func (s *Store) SandboxByID(ctx context.Context, id string) (*Sandbox, error) {
	x, err := scanSandbox(s.db.QueryRowContext(ctx,
		`SELECT `+sandboxCols+` FROM sandboxes WHERE id = ? AND expires_at > unixepoch()`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	} else if err != nil {
		return nil, fmt.Errorf("get sandbox %s: %w", id, err)
	}
	return x, nil
}

// SandboxByRequest is the idempotency probe of POST /demo/sandbox (one sandbox per requestId).
func (s *Store) SandboxByRequest(ctx context.Context, requestID string) (*Sandbox, error) {
	if requestID == "" {
		return nil, nil
	}
	x, err := scanSandbox(s.db.QueryRowContext(ctx,
		`SELECT `+sandboxCols+` FROM sandboxes WHERE request_id = ?`, requestID))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	} else if err != nil {
		return nil, fmt.Errorf("get sandbox by request %s: %w", requestID, err)
	}
	return x, nil
}

// SandboxByMint resolves a bond mint to its sandbox (series_settings.sandbox_id); nil = no sandbox.
func (s *Store) SandboxByMint(ctx context.Context, mint string) (*Sandbox, error) {
	x, err := scanSandbox(s.db.QueryRowContext(ctx,
		`SELECT s.id, s.request_id, s.ip, s.ticker, s.mint, s.wallet, s.holders, s.created_at, s.expires_at,
		   s.skip_funding, s.claim_index, s.claim_until
		 FROM sandboxes s JOIN series_settings ss ON ss.sandbox_id = s.id
		 WHERE ss.series_mint = ? AND s.expires_at > unixepoch()`, mint))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	} else if err != nil {
		return nil, fmt.Errorf("get sandbox of mint %s: %w", mint, err)
	}
	return x, nil
}

// CountSandboxesSince counts sandboxes an IP created since a unix ts (ip "" = everyone: the daily cap).
func (s *Store) CountSandboxesSince(ctx context.Context, ip string, since int64) (int, error) {
	var n int
	if err := s.db.QueryRowContext(ctx,
		`SELECT count(*) FROM sandboxes WHERE created_at >= ? AND (? = '' OR ip = ?)`, since, ip, ip).Scan(&n); err != nil {
		return 0, fmt.Errorf("count sandboxes since %d (ip %q): %w", since, ip, err)
	}
	return n, nil
}

// SetSandboxSkip records the skip_funding scenario (and clears it again on cure).
func (s *Store) SetSandboxSkip(ctx context.Context, id string, on bool) error {
	if _, err := s.db.ExecContext(ctx, `UPDATE sandboxes SET skip_funding = ? WHERE id = ?`, on, id); err != nil {
		return fmt.Errorf("set sandbox %s skip_funding: %w", id, err)
	}
	return nil
}

// ArmSandboxClaim arms the visitor-wallet claim window for one action index (task 1524 / 1532 contract:
// the autopilot leaves that holder's payout unpaid ~60 s for their own Claim button).
func (s *Store) ArmSandboxClaim(ctx context.Context, id string, index uint32, until int64) error {
	if _, err := s.db.ExecContext(ctx,
		`UPDATE sandboxes SET claim_index = ?, claim_until = ? WHERE id = ?`, index, until, id); err != nil {
		return fmt.Errorf("arm sandbox %s claim window: %w", id, err)
	}
	return nil
}

// SandboxScenarioRow is one stored scenario result (detail = the SandboxScenario JSON, replayed verbatim).
type SandboxScenarioRow struct {
	Kind   string
	At     int64
	Detail []byte
}

// InsertSandboxScenario appends a scenario result.
func (s *Store) InsertSandboxScenario(ctx context.Context, sandboxID, kind string, at int64, detail []byte) error {
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO sandbox_scenarios (sandbox_id, kind, at, detail) VALUES (?, ?, ?, ?)`,
		sandboxID, kind, at, string(detail)); err != nil {
		return fmt.Errorf("insert sandbox scenario %s/%s: %w", sandboxID, kind, err)
	}
	return nil
}

// ListSandboxScenarios returns a sandbox' scenarios oldest first.
func (s *Store) ListSandboxScenarios(ctx context.Context, sandboxID string) ([]SandboxScenarioRow, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT kind, at, detail FROM sandbox_scenarios WHERE sandbox_id = ? ORDER BY at, id`, sandboxID)
	if err != nil {
		return nil, fmt.Errorf("list sandbox scenarios %s: %w", sandboxID, err)
	}
	defer func() { _ = rows.Close() }()
	var out []SandboxScenarioRow
	for rows.Next() {
		var r SandboxScenarioRow
		var detail string
		if err := rows.Scan(&r.Kind, &r.At, &detail); err != nil {
			return nil, fmt.Errorf("scan sandbox scenario: %w", err)
		}
		r.Detail = []byte(detail)
		out = append(out, r)
	}
	return out, rows.Err()
}

// SetSeriesSandbox ties a mint to its sandbox (series_settings.sandbox_id, migration 007): the public
// /series listing filters on it and the scheduler's claim window resolves it.
func (s *Store) SetSeriesSandbox(ctx context.Context, mint, id string) error {
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO series_settings (series_mint, sandbox_id, updated_at) VALUES (?, ?, unixepoch())
		 ON CONFLICT(series_mint) DO UPDATE SET sandbox_id = excluded.sandbox_id, updated_at = excluded.updated_at`,
		mint, id); err != nil {
		return fmt.Errorf("set sandbox_id %s: %w", mint, err)
	}
	return nil
}
