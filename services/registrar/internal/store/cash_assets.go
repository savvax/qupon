package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// CashAsset is a token the platform accepts as the cash leg of a series on one network. Assets are keyed by mint
// address — never by ticker (impostor tokens reuse tickers such as KZTE).
type CashAsset struct {
	Network         string  `json:"network"`
	Mint            string  `json:"mint"`
	Symbol          string  `json:"symbol"`
	Name            string  `json:"name"`
	Decimals        int     `json:"decimals"`
	TokenProgram    string  `json:"tokenProgram"`
	Kind            string  `json:"kind"` // test | stablecoin | wrapped_cbdc | spl
	IssuerNote      string  `json:"issuerNote"`
	MintAuthority   *string `json:"mintAuthority"`
	FreezeAuthority *string `json:"freezeAuthority"`
	VerifiedAt      *int64  `json:"verifiedAt"` // last on-chain verification (unix seconds)
	Enabled         bool    `json:"enabled"`
	CreatedAt       int64   `json:"createdAt"`
}

const assetCols = `network, mint, symbol, name, decimals, token_program, kind, issuer_note, mint_authority,
	freeze_authority, verified_at, enabled, created_at`

func scanAsset(row interface{ Scan(...any) error }) (CashAsset, error) {
	var a CashAsset
	var mintAuth, freezeAuth sql.NullString
	var verified sql.NullInt64
	err := row.Scan(&a.Network, &a.Mint, &a.Symbol, &a.Name, &a.Decimals, &a.TokenProgram, &a.Kind, &a.IssuerNote,
		&mintAuth, &freezeAuth, &verified, &a.Enabled, &a.CreatedAt)
	if mintAuth.Valid {
		a.MintAuthority = &mintAuth.String
	}
	if freezeAuth.Valid {
		a.FreezeAuthority = &freezeAuth.String
	}
	if verified.Valid {
		a.VerifiedAt = &verified.Int64
	}
	return a, err
}

// UpsertCashAsset inserts or replaces an asset (all fields; created_at is kept on update).
func (s *Store) UpsertCashAsset(ctx context.Context, a CashAsset) error {
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO cash_assets (network, mint, symbol, name, decimals, token_program, kind, issuer_note,
		   mint_authority, freeze_authority, verified_at, enabled, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
		 ON CONFLICT(network, mint) DO UPDATE SET
		   symbol = excluded.symbol, name = excluded.name, decimals = excluded.decimals,
		   token_program = excluded.token_program, kind = excluded.kind, issuer_note = excluded.issuer_note,
		   mint_authority = excluded.mint_authority, freeze_authority = excluded.freeze_authority,
		   verified_at = excluded.verified_at, enabled = excluded.enabled`,
		a.Network, a.Mint, a.Symbol, a.Name, a.Decimals, a.TokenProgram, a.Kind, a.IssuerNote,
		a.MintAuthority, a.FreezeAuthority, a.VerifiedAt, a.Enabled); err != nil {
		return fmt.Errorf("upsert cash asset %s: %w", a.Mint, err)
	}
	return nil
}

// InsertCashAssetIfMissing seeds a preset without overwriting an admin's later edits.
func (s *Store) InsertCashAssetIfMissing(ctx context.Context, a CashAsset) error {
	if _, err := s.GetCashAsset(ctx, a.Network, a.Mint); err == nil {
		return nil
	} else if !errors.Is(err, ErrNotFound) {
		return err
	}
	return s.UpsertCashAsset(ctx, a)
}

// GetCashAsset returns one asset of a network (ErrNotFound if absent).
func (s *Store) GetCashAsset(ctx context.Context, network, mint string) (CashAsset, error) {
	a, err := scanAsset(s.db.QueryRowContext(ctx,
		`SELECT `+assetCols+` FROM cash_assets WHERE network = ? AND mint = ?`, network, mint))
	if errors.Is(err, sql.ErrNoRows) {
		return CashAsset{}, ErrNotFound
	} else if err != nil {
		return CashAsset{}, fmt.Errorf("get cash asset %s: %w", mint, err)
	}
	return a, nil
}

// ListCashAssets returns a network's assets by symbol; onlyEnabled drops disabled ones.
func (s *Store) ListCashAssets(ctx context.Context, network string, onlyEnabled bool) ([]CashAsset, error) {
	q := `SELECT ` + assetCols + ` FROM cash_assets WHERE network = ?`
	if onlyEnabled {
		q += ` AND enabled = 1`
	}
	rows, err := s.db.QueryContext(ctx, q+` ORDER BY symbol, mint`, network)
	if err != nil {
		return nil, fmt.Errorf("list cash assets: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := []CashAsset{}
	for rows.Next() {
		a, err := scanAsset(rows)
		if err != nil {
			return nil, fmt.Errorf("scan cash asset: %w", err)
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// CashAssetSymbol is the registry symbol of a cash mint on any network (mints are unique pubkeys); ok=false
// when the mint is not registered.
func (s *Store) CashAssetSymbol(ctx context.Context, mint string) (string, bool) {
	var sym string
	if err := s.db.QueryRowContext(ctx, `SELECT symbol FROM cash_assets WHERE mint = ? LIMIT 1`, mint).Scan(&sym); err != nil {
		return "", false
	}
	return sym, true
}
