package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// ErrSeriesExists is returned when a series name is already registered.
var ErrSeriesExists = errors.New("series name already registered")

// RegistryRow maps a series name to its bond mint and on-chain terms.
type RegistryRow struct {
	Name  string
	Mint  string
	Terms json.RawMessage
}

// InsertRegistry registers a new series; a duplicate name gives ErrSeriesExists.
func (s *Store) InsertRegistry(ctx context.Context, r RegistryRow) error {
	terms := "null"
	if len(r.Terms) > 0 {
		terms = string(r.Terms)
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO series_registry (name, mint, terms, created_at) VALUES (?, ?, ?, unixepoch())`,
		r.Name, r.Mint, terms); err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return ErrSeriesExists
		}
		return fmt.Errorf("insert registry %s: %w", r.Name, err)
	}
	return nil
}

// UpsertRegistry registers a series or updates its mint and terms by name.
func (s *Store) UpsertRegistry(ctx context.Context, r RegistryRow) error {
	terms := "null"
	if len(r.Terms) > 0 {
		terms = string(r.Terms)
	}
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO series_registry (name, mint, terms, created_at) VALUES (?, ?, ?, unixepoch())
		 ON CONFLICT(name) DO UPDATE SET mint = excluded.mint, terms = excluded.terms`,
		r.Name, r.Mint, terms); err != nil {
		return fmt.Errorf("upsert registry %s: %w", r.Name, err)
	}
	return nil
}

// ListRegistry returns all registered series ordered by name.
func (s *Store) ListRegistry(ctx context.Context) ([]RegistryRow, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT name, mint, terms FROM series_registry ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list registry: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var out []RegistryRow
	for rows.Next() {
		var r RegistryRow
		var terms string
		if err := rows.Scan(&r.Name, &r.Mint, &terms); err != nil {
			return nil, fmt.Errorf("scan registry: %w", err)
		}
		r.Terms = json.RawMessage(terms)
		out = append(out, r)
	}
	return out, rows.Err()
}
