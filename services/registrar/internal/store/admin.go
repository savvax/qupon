package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// Admin-facing lookups (platform v2 §5.2): user management, reset links, filtered audit.

// ErrEmailTaken is returned when an admin creates a user whose email already exists.
var ErrEmailTaken = errors.New("email already taken")

// ListUsers returns users filtered by a free-text query (email or name),
// role and status; every filter is optional.
func (s *Store) ListUsers(ctx context.Context, q, role, status string) ([]User, error) {
	where, args := []string{"1=1"}, []any{}
	if q != "" {
		where = append(where, "(u.email LIKE ? OR u.name LIKE ?)")
		like := "%" + q + "%"
		args = append(args, like, like)
	}
	if role != "" {
		where = append(where, "u.role = ?")
		args = append(args, role)
	}
	if status != "" {
		where = append(where, "u.status = ?")
		args = append(args, status)
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+userCols+` FROM users u WHERE `+strings.Join(where, " AND ")+` ORDER BY u.id`, args...)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := []User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// GetUser returns one user (ErrNotFound if absent).
func (s *Store) GetUser(ctx context.Context, id int64) (User, error) {
	u, err := scanUser(s.db.QueryRowContext(ctx, `SELECT `+userCols+` FROM users u WHERE u.id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	} else if err != nil {
		return User{}, fmt.Errorf("get user %d: %w", id, err)
	}
	return u, nil
}

// CreateUser inserts a user with a password hash and status/locale defaults.
func (s *Store) CreateUser(ctx context.Context, u User, passwordHash string) (User, error) {
	if _, _, err := s.UserByEmail(ctx, u.Email); errors.Is(err, ErrNoUser) {
		// not taken
	} else if err != nil {
		return User{}, err
	} else {
		return User{}, ErrEmailTaken
	}
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO users (email, name, role, password_hash, is_demo, org_id, status, locale, created_at)
		 VALUES (?, ?, ?, ?, 0, ?, 'active', 'en', unixepoch())`,
		u.Email, u.Name, u.Role, passwordHash, u.OrgID)
	if err != nil {
		return User{}, fmt.Errorf("create user %s: %w", u.Email, err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return User{}, fmt.Errorf("user id: %w", err)
	}
	return s.GetUser(ctx, id)
}

// UpdateUser writes the mutable admin fields (name, role, org, status) of one user.
func (s *Store) UpdateUser(ctx context.Context, u User) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE users SET name = ?, role = ?, org_id = ?, status = ? WHERE id = ?`,
		u.Name, u.Role, u.OrgID, u.Status, u.ID)
	if err != nil {
		return fmt.Errorf("update user %d: %w", u.ID, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// SetUserPassword replaces a user's password hash (admin-issued reset).
func (s *Store) SetUserPassword(ctx context.Context, userID int64, passwordHash string) error {
	if _, err := s.db.ExecContext(ctx,
		`UPDATE users SET password_hash = ? WHERE id = ?`, passwordHash, userID); err != nil {
		return fmt.Errorf("set password %d: %w", userID, err)
	}
	return nil
}

// CreateResetLink stores a reset token hash for a user until expiresAt (unix).
// Only the sha256 of the token is persisted; the raw token is shown once by the API.
func (s *Store) CreateResetLink(ctx context.Context, tokenHash string, userID, expiresAt, createdBy int64) error {
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO reset_links (token_hash, user_id, expires_at, created_by) VALUES (?, ?, ?, ?)`,
		tokenHash, userID, expiresAt, createdBy); err != nil {
		return fmt.Errorf("create reset link: %w", err)
	}
	return nil
}

// ConsumeResetLink marks a reset token used and returns its user. It fails with
// ErrNotFound when the token is unknown, already used or expired (single use, 24 h).
func (s *Store) ConsumeResetLink(ctx context.Context, tokenHash string, now int64) (int64, error) {
	res, err := s.db.ExecContext(ctx,
		`UPDATE reset_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
		now, tokenHash, now)
	if err != nil {
		return 0, fmt.Errorf("consume reset link: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return 0, ErrNotFound
	}
	var userID int64
	if err := s.db.QueryRowContext(ctx,
		`SELECT user_id FROM reset_links WHERE token_hash = ?`, tokenHash).Scan(&userID); err != nil {
		return 0, fmt.Errorf("reset link user: %w", err)
	}
	return userID, nil
}

// UpdateOrganization writes the mutable fields of an organisation.
func (s *Store) UpdateOrganization(ctx context.Context, o Organization) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE organizations SET name = ?, kind = ?, bin = ?, website = ? WHERE id = ?`,
		o.Name, o.Kind, o.BIN, o.Website, o.ID)
	if err != nil {
		return fmt.Errorf("update organization %d: %w", o.ID, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// AuditFilter narrows the audit feed; the zero value returns everything.
type AuditFilter struct {
	User  string // email substring, or a numeric user id
	Role  string
	Route string // substring
	OK    *bool
	From  int64 // unix seconds, inclusive
	To    int64 // unix seconds, inclusive
	Limit int
}

// AuditRow is an AuditEntry with the acting user's email resolved.
type AuditRow struct {
	AuditEntry
	Email string `json:"email"`
}

// SearchAudit returns audit rows newest first, filtered, with the user's email.
func (s *Store) SearchAudit(ctx context.Context, f AuditFilter) ([]AuditRow, error) {
	where, args := []string{"1=1"}, []any{}
	if f.User != "" {
		if id, err := strconv.ParseInt(f.User, 10, 64); err == nil {
			where = append(where, "a.user_id = ?")
			args = append(args, id)
		} else {
			where = append(where, "u.email LIKE ?")
			args = append(args, "%"+f.User+"%")
		}
	}
	if f.Role != "" {
		where = append(where, "a.role = ?")
		args = append(args, f.Role)
	}
	if f.Route != "" {
		where = append(where, "a.route LIKE ?")
		args = append(args, "%"+f.Route+"%")
	}
	if f.OK != nil {
		where = append(where, "a.ok = ?")
		args = append(args, *f.OK)
	}
	if f.From != 0 {
		where = append(where, "a.ts >= ?")
		args = append(args, f.From)
	}
	if f.To != 0 {
		where = append(where, "a.ts <= ?")
		args = append(args, f.To)
	}
	limit := f.Limit
	if limit <= 0 {
		limit = 200
	}
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx,
		`SELECT a.id, a.ts, a.user_id, a.role, a.route, a.params, a.ok, a.detail, a.signatures, IFNULL(u.email, '')
		 FROM audit a LEFT JOIN users u ON u.id = a.user_id
		 WHERE `+strings.Join(where, " AND ")+` ORDER BY a.id DESC LIMIT ?`, args...)
	if err != nil {
		return nil, fmt.Errorf("search audit: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := []AuditRow{}
	for rows.Next() {
		var e AuditRow
		var ok int
		var params, sigs string
		if err := rows.Scan(&e.ID, &e.Ts, &e.UserID, &e.Role, &e.Route,
			&params, &ok, &e.Detail, &sigs, &e.Email); err != nil {
			return nil, fmt.Errorf("scan audit: %w", err)
		}
		e.Params = json.RawMessage(params)
		e.OK = ok != 0
		if err := json.Unmarshal([]byte(sigs), &e.Signatures); err != nil {
			return nil, fmt.Errorf("decode audit signatures: %w", err)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
