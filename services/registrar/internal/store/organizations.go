package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// ErrNotFound is returned by platform v2 lookups (organisations, assets, settings) for a missing row.
var ErrNotFound = errors.New("not found")

// Organization is an issuer or registrar company whose staff share access to its series.
type Organization struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Kind      string `json:"kind"` // issuer | registrar
	BIN       string `json:"bin"`  // Kazakh business identification number, optional
	Website   string `json:"website"`
	CreatedAt int64  `json:"createdAt"`
}

const orgCols = `id, name, kind, bin, website, created_at`

func scanOrg(row interface{ Scan(...any) error }) (Organization, error) {
	var o Organization
	err := row.Scan(&o.ID, &o.Name, &o.Kind, &o.BIN, &o.Website, &o.CreatedAt)
	return o, err
}

// CreateOrganization inserts an organisation and returns it with its id.
func (s *Store) CreateOrganization(ctx context.Context, o Organization) (Organization, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO organizations (name, kind, bin, website, created_at) VALUES (?, ?, ?, ?, unixepoch())`,
		o.Name, o.Kind, o.BIN, o.Website)
	if err != nil {
		return Organization{}, fmt.Errorf("create organization %q: %w", o.Name, err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Organization{}, fmt.Errorf("organization id: %w", err)
	}
	return s.GetOrganization(ctx, id)
}

// GetOrganization returns one organisation (ErrNotFound if absent).
func (s *Store) GetOrganization(ctx context.Context, id int64) (Organization, error) {
	o, err := scanOrg(s.db.QueryRowContext(ctx, `SELECT `+orgCols+` FROM organizations WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Organization{}, ErrNotFound
	} else if err != nil {
		return Organization{}, fmt.Errorf("get organization %d: %w", id, err)
	}
	return o, nil
}

// OrganizationByName returns the first organisation with this name (ErrNotFound if absent).
func (s *Store) OrganizationByName(ctx context.Context, name string) (Organization, error) {
	o, err := scanOrg(s.db.QueryRowContext(ctx,
		`SELECT `+orgCols+` FROM organizations WHERE name = ? ORDER BY id LIMIT 1`, name))
	if errors.Is(err, sql.ErrNoRows) {
		return Organization{}, ErrNotFound
	} else if err != nil {
		return Organization{}, fmt.Errorf("organization %q: %w", name, err)
	}
	return o, nil
}

// ListOrganizations returns every organisation, oldest first.
func (s *Store) ListOrganizations(ctx context.Context) ([]Organization, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+orgCols+` FROM organizations ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("list organizations: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := []Organization{}
	for rows.Next() {
		o, err := scanOrg(rows)
		if err != nil {
			return nil, fmt.Errorf("scan organization: %w", err)
		}
		out = append(out, o)
	}
	return out, rows.Err()
}
