package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// SeriesSettings is the platform's off-chain metadata for a series: owning organisation, visibility,
// featuring and its KASE ticker. A series without a row has the zero value (visible, no org, no ticker).
type SeriesSettings struct {
	SeriesMint string `json:"seriesMint"`
	OrgID      *int64 `json:"orgId"`
	Hidden     bool   `json:"hidden"`
	Featured   bool   `json:"featured"`
	KaseTicker string `json:"kaseTicker"`
	NoAutofund bool   `json:"noAutofund"` // task 91541: read-only here; writes go through SetSeriesNoAutofund
	// Plan 15: the sandbox a mint belongs to (task 1524 — filters the public /series listing, keys the claim window).
	SandboxID string `json:"sandboxId"`
	UpdatedAt int64  `json:"updatedAt"`
}

const settingsCols = `series_mint, org_id, hidden, featured, kase_ticker, no_autofund, sandbox_id, updated_at`

func scanSettings(row interface{ Scan(...any) error }) (SeriesSettings, error) {
	var x SeriesSettings
	var org sql.NullInt64
	// Rows created before the scenario migrations carry NULL in no_autofund/sandbox_id.
	var noAutofund sql.NullBool
	var sandboxID sql.NullString
	err := row.Scan(&x.SeriesMint, &org, &x.Hidden, &x.Featured, &x.KaseTicker, &noAutofund, &sandboxID, &x.UpdatedAt)
	if org.Valid {
		x.OrgID = &org.Int64
	}
	x.NoAutofund, x.SandboxID = noAutofund.Bool, sandboxID.String
	return x, err
}

// UpsertSeriesSettings writes every field of a series' settings.
func (s *Store) UpsertSeriesSettings(ctx context.Context, x SeriesSettings) error {
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO series_settings (series_mint, org_id, hidden, featured, kase_ticker, updated_at)
		 VALUES (?, ?, ?, ?, ?, unixepoch())
		 ON CONFLICT(series_mint) DO UPDATE SET org_id = excluded.org_id, hidden = excluded.hidden,
		   featured = excluded.featured, kase_ticker = excluded.kase_ticker, updated_at = excluded.updated_at`,
		x.SeriesMint, x.OrgID, x.Hidden, x.Featured, x.KaseTicker); err != nil {
		return fmt.Errorf("upsert series settings %s: %w", x.SeriesMint, err)
	}
	return nil
}

// GetSeriesSettings returns a series' settings, or the zero value (with SeriesMint set) when it has none.
func (s *Store) GetSeriesSettings(ctx context.Context, mint string) (SeriesSettings, error) {
	x, err := scanSettings(s.db.QueryRowContext(ctx,
		`SELECT `+settingsCols+` FROM series_settings WHERE series_mint = ?`, mint))
	if errors.Is(err, sql.ErrNoRows) {
		return SeriesSettings{SeriesMint: mint}, nil
	} else if err != nil {
		return SeriesSettings{}, fmt.Errorf("get series settings %s: %w", mint, err)
	}
	return x, nil
}

// ListSeriesSettings returns every stored row keyed by series mint.
func (s *Store) ListSeriesSettings(ctx context.Context) (map[string]SeriesSettings, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+settingsCols+` FROM series_settings`)
	if err != nil {
		return nil, fmt.Errorf("list series settings: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := map[string]SeriesSettings{}
	for rows.Next() {
		x, err := scanSettings(rows)
		if err != nil {
			return nil, fmt.Errorf("scan series settings: %w", err)
		}
		out[x.SeriesMint] = x
	}
	return out, rows.Err()
}

// HideSeriesIfUnset marks a series hidden unless an admin already stored settings for it (startup import of
// the HIDE_SERIES list, which predates the admin panel).
func (s *Store) HideSeriesIfUnset(ctx context.Context, mint string) error {
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO series_settings (series_mint, hidden, updated_at) VALUES (?, 1, unixepoch())
		 ON CONFLICT(series_mint) DO NOTHING`, mint); err != nil {
		return fmt.Errorf("hide series %s: %w", mint, err)
	}
	return nil
}

// SetSeriesNoAutofund sets the per-series scenario flag (plan 15, task 1522): true keeps the autopilot from funding
// the escrow even when the registrar runs with autofund, so the coupon defaults (sandbox "skip funding").
func (s *Store) SetSeriesNoAutofund(ctx context.Context, mint string, on bool) error {
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO series_settings (series_mint, no_autofund, updated_at) VALUES (?, ?, unixepoch())
		 ON CONFLICT(series_mint) DO UPDATE SET no_autofund = excluded.no_autofund, updated_at = excluded.updated_at`,
		mint, on); err != nil {
		return fmt.Errorf("set no_autofund %s: %w", mint, err)
	}
	return nil
}

// NoAutofundSeries returns the mints whose autopilot must not fund (no_autofund = 1).
func (s *Store) NoAutofundSeries(ctx context.Context) (map[string]bool, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT series_mint FROM series_settings WHERE no_autofund = 1`)
	if err != nil {
		return nil, fmt.Errorf("list no_autofund: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := map[string]bool{}
	for rows.Next() {
		var m string
		if err := rows.Scan(&m); err != nil {
			return nil, fmt.Errorf("scan no_autofund: %w", err)
		}
		out[m] = true
	}
	return out, rows.Err()
}
