package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// Document is an uploaded file (KYC evidence or issue documents). The bytes live on disk under DATA_DIR,
// content-addressed by sha256; the row says who may read them.
type Document struct {
	ID          int64   `json:"id"`
	OwnerUserID int64   `json:"ownerUserId"`
	OrgID       *int64  `json:"orgId"`
	Kind        string  `json:"kind"` // id_document | proof_of_address | prospectus | decision | other
	Filename    string  `json:"filename"`
	Mime        string  `json:"mime"`
	Size        int64   `json:"size"`
	SHA256      string  `json:"sha256"`
	Path        string  `json:"-"`
	SeriesMint  *string `json:"seriesMint"` // set when attached to a series (public)
	CreatedAt   int64   `json:"createdAt"`
}

const docCols = `id, owner_user_id, org_id, kind, filename, mime, size, sha256, path, series_mint, created_at`

func scanDoc(row interface{ Scan(...any) error }) (Document, error) {
	var d Document
	var org sql.NullInt64
	var series sql.NullString
	err := row.Scan(&d.ID, &d.OwnerUserID, &org, &d.Kind, &d.Filename, &d.Mime, &d.Size, &d.SHA256, &d.Path, &series, &d.CreatedAt)
	if org.Valid {
		d.OrgID = &org.Int64
	}
	if series.Valid {
		d.SeriesMint = &series.String
	}
	return d, err
}

// CreateDocument stores a document row and returns it with its id.
func (s *Store) CreateDocument(ctx context.Context, d Document) (Document, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO documents (owner_user_id, org_id, kind, filename, mime, size, sha256, path, series_mint, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
		d.OwnerUserID, d.OrgID, d.Kind, d.Filename, d.Mime, d.Size, d.SHA256, d.Path, d.SeriesMint)
	if err != nil {
		return Document{}, fmt.Errorf("create document: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Document{}, fmt.Errorf("document id: %w", err)
	}
	return s.GetDocument(ctx, id)
}

// GetDocument returns one document row (ErrNotFound if absent).
func (s *Store) GetDocument(ctx context.Context, id int64) (Document, error) {
	d, err := scanDoc(s.db.QueryRowContext(ctx, `SELECT `+docCols+` FROM documents WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Document{}, ErrNotFound
	} else if err != nil {
		return Document{}, fmt.Errorf("get document %d: %w", id, err)
	}
	return d, nil
}

// ListDocumentsByOwner returns a user's uploads, newest first.
func (s *Store) ListDocumentsByOwner(ctx context.Context, userID int64) ([]Document, error) {
	return s.listDocs(ctx, `SELECT `+docCols+` FROM documents WHERE owner_user_id = ? ORDER BY id DESC`, userID)
}

// ListDocumentsByIDs returns the documents with these ids (any order; missing ids are skipped).
func (s *Store) ListDocumentsByIDs(ctx context.Context, ids []int64) ([]Document, error) {
	out := []Document{}
	for _, id := range ids {
		d, err := s.GetDocument(ctx, id)
		if errors.Is(err, ErrNotFound) {
			continue
		} else if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, nil
}

func (s *Store) listDocs(ctx context.Context, q string, args ...any) ([]Document, error) {
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("list documents: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := []Document{}
	for rows.Next() {
		d, err := scanDoc(rows)
		if err != nil {
			return nil, fmt.Errorf("scan document: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
