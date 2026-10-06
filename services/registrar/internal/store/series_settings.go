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
	UpdatedAt  int64  `json:"updatedAt"`
}

const settingsCols = `series_mint, org_id, hidden, featured, kase_ticker, updated_at`

func scanSettings(row interface{ Scan(...any) error }) (SeriesSettings, error) {
	var x SeriesSettings
	var org sql.NullInt64
	err := row.Scan(&x.SeriesMint, &org, &x.Hidden, &x.Featured, &x.KaseTicker, &x.UpdatedAt)
	if org.Valid {
		x.OrgID = &org.Int64
	}
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
