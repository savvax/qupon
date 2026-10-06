package store

import (
	"context"
	"fmt"
)

// Organisation membership and one-time invite links (platform v2 §5.3, task 807).

// ListOrgMembers returns the users attached to an organisation, oldest first.
func (s *Store) ListOrgMembers(ctx context.Context, orgID int64) ([]User, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+userCols+` FROM users u WHERE u.org_id = ? ORDER BY u.id`, orgID)
	if err != nil {
		return nil, fmt.Errorf("list org members %d: %w", orgID, err)
	}
	defer func() { _ = rows.Close() }()
	out := []User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, fmt.Errorf("scan org member: %w", err)
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// CreateInvite stores an invite token hash (only the sha256 is persisted; the raw token is
// shown once by the API) for email joining orgID as role, expiring at expiresAt (unix).
func (s *Store) CreateInvite(ctx context.Context, tokenHash string, orgID int64, role, email string, expiresAt, createdBy int64) error {
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO invites (token_hash, org_id, role, email, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
		tokenHash, orgID, role, email, expiresAt, createdBy); err != nil {
		return fmt.Errorf("create invite: %w", err)
	}
	return nil
}

// ConsumeInvite marks an invite used in the same step that validates it (single use) and
// returns the organisation, role and email it was issued for. ErrNotFound when the token is
// unknown, already used or expired.
func (s *Store) ConsumeInvite(ctx context.Context, tokenHash string, now int64) (orgID int64, role, email string, err error) {
	res, err := s.db.ExecContext(ctx,
		`UPDATE invites SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
		now, tokenHash, now)
	if err != nil {
		return 0, "", "", fmt.Errorf("consume invite: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return 0, "", "", ErrNotFound
	}
	if err := s.db.QueryRowContext(ctx,
		`SELECT org_id, role, email FROM invites WHERE token_hash = ?`, tokenHash).Scan(&orgID, &role, &email); err != nil {
		return 0, "", "", fmt.Errorf("invite row: %w", err)
	}
	return orgID, role, email, nil
}

// SetSeriesOrg stamps the owning organisation on a series' settings without touching the
// admin-managed fields (hidden, featured, kase_ticker): createSeries calls it on success.
func (s *Store) SetSeriesOrg(ctx context.Context, mint string, orgID *int64) error {
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO series_settings (series_mint, org_id, updated_at) VALUES (?, ?, unixepoch())
		 ON CONFLICT(series_mint) DO UPDATE SET org_id = excluded.org_id, updated_at = unixepoch()`,
		mint, orgID); err != nil {
		return fmt.Errorf("set series org %s: %w", mint, err)
	}
	return nil
}

// ListDocumentsBySeries returns the documents attached to a series (public metadata), newest first.
func (s *Store) ListDocumentsBySeries(ctx context.Context, mint string) ([]Document, error) {
	return s.listDocs(ctx,
		`SELECT `+docCols+` FROM documents WHERE series_mint = ? ORDER BY id DESC`, mint)
}

// AttachSeriesDocument publishes one of the organisation's documents on a series and re-kinds it.
func (s *Store) AttachSeriesDocument(ctx context.Context, id int64, mint, kind string) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE documents SET series_mint = ?, kind = ? WHERE id = ?`, mint, kind, id)
	if err != nil {
		return fmt.Errorf("attach document %d to %s: %w", id, mint, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
