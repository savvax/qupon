package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// Back-office user errors.
var (
	ErrNoUser    = errors.New("no such user")
	ErrNoSession = errors.New("no valid session")
)

// User is one back-office account (issuer, registrar, investor_demo or admin).
type User struct {
	ID     int64
	Email  string
	Name   string
	Role   string
	IsDemo bool
}

// UpsertUser inserts or updates a user by email and returns its id.
func (s *Store) UpsertUser(ctx context.Context, u User, passwordHash string) (int64, error) {
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO users (email, name, role, password_hash, is_demo, created_at)
		 VALUES (?, ?, ?, ?, ?, unixepoch())
		 ON CONFLICT(email) DO UPDATE SET
		   name = excluded.name, role = excluded.role,
		   password_hash = excluded.password_hash, is_demo = excluded.is_demo`,
		u.Email, u.Name, u.Role, passwordHash, u.IsDemo); err != nil {
		return 0, fmt.Errorf("upsert user %s: %w", u.Email, err)
	}
	var id int64
	if err := s.db.QueryRowContext(ctx,
		`SELECT id FROM users WHERE email = ?`, u.Email).Scan(&id); err != nil {
		return 0, fmt.Errorf("user id %s: %w", u.Email, err)
	}
	return id, nil
}

// UserByEmail returns the user and her password hash (ErrNoUser if unknown).
func (s *Store) UserByEmail(ctx context.Context, email string) (User, string, error) {
	var u User
	var hash string
	err := s.db.QueryRowContext(ctx,
		`SELECT id, email, name, role, password_hash, is_demo FROM users WHERE email = ?`,
		email).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &hash, &u.IsDemo)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, "", ErrNoUser
	} else if err != nil {
		return User{}, "", fmt.Errorf("user by email %s: %w", email, err)
	}
	return u, hash, nil
}

// DemoUser returns the seeded demo account for a role (ErrNoUser if absent).
func (s *Store) DemoUser(ctx context.Context, role string) (User, error) {
	var u User
	err := s.db.QueryRowContext(ctx,
		`SELECT id, email, name, role, is_demo FROM users WHERE role = ? AND is_demo = 1`,
		role).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.IsDemo)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNoUser
	} else if err != nil {
		return User{}, fmt.Errorf("demo user %s: %w", role, err)
	}
	return u, nil
}

// CreateSession stores a session token hash for a user until expiresAt.
func (s *Store) CreateSession(ctx context.Context, tokenHash string, userID, expiresAt int64) error {
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)
		 ON CONFLICT(token_hash) DO UPDATE SET user_id = excluded.user_id, expires_at = excluded.expires_at`,
		tokenHash, userID, expiresAt); err != nil {
		return fmt.Errorf("create session: %w", err)
	}
	return nil
}

// SessionUser resolves a token hash to its user; ErrNoSession when the
// session is unknown, deleted or expired (expires_at must be > now).
func (s *Store) SessionUser(ctx context.Context, tokenHash string, now int64) (User, error) {
	var u User
	err := s.db.QueryRowContext(ctx,
		`SELECT u.id, u.email, u.name, u.role, u.is_demo
		 FROM sessions s JOIN users u ON u.id = s.user_id
		 WHERE s.token_hash = ? AND s.expires_at > ?`,
		tokenHash, now).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.IsDemo)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNoSession
	} else if err != nil {
		return User{}, fmt.Errorf("session user: %w", err)
	}
	return u, nil
}

// DeleteSession removes a session (logout).
func (s *Store) DeleteSession(ctx context.Context, tokenHash string) error {
	if _, err := s.db.ExecContext(ctx,
		`DELETE FROM sessions WHERE token_hash = ?`, tokenHash); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}
