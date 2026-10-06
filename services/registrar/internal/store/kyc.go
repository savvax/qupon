package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

// KYC errors.
var (
	ErrKycPending = errors.New("an application is already under review")
	ErrKycDecided = errors.New("application already decided")
)

// KycApplication is an investor's request to be verified and registered in series (review SIMULATED: a
// registrar decides by hand; there is no KYC vendor).
type KycApplication struct {
	ID           int64           `json:"id"`
	UserID       int64           `json:"userId"`
	UserEmail    string          `json:"userEmail"`
	UserName     string          `json:"userName"`
	Wallet       string          `json:"wallet"`
	InvestorType string          `json:"investorType"`
	Residency    string          `json:"residency"`
	TaxBps       int             `json:"taxBps"`
	FullName     string          `json:"fullName"`
	DocIDs       []int64         `json:"documentIds"`
	SeriesMints  []string        `json:"seriesMints"`
	Status       string          `json:"status"` // submitted | approved | rejected
	Reason       string          `json:"reason"`
	Results      json.RawMessage `json:"results"` // per-series onboarding results of the last approval attempt
	DecidedBy    *int64          `json:"decidedBy"`
	DecidedAt    *int64          `json:"decidedAt"`
	CreatedAt    int64           `json:"createdAt"`
}

const kycCols = `k.id, k.user_id, u.email, u.name, k.wallet, k.investor_type, k.residency, k.tax_bps, k.full_name,
	k.doc_ids, k.series_mints, k.status, k.reason, k.results, k.decided_by, k.decided_at, k.created_at`

func scanKyc(row interface{ Scan(...any) error }) (KycApplication, error) {
	var a KycApplication
	var docs, series, results string
	var by, at sql.NullInt64
	err := row.Scan(&a.ID, &a.UserID, &a.UserEmail, &a.UserName, &a.Wallet, &a.InvestorType, &a.Residency, &a.TaxBps,
		&a.FullName, &docs, &series, &a.Status, &a.Reason, &results, &by, &at, &a.CreatedAt)
	if err != nil {
		return a, err
	}
	if err := json.Unmarshal([]byte(docs), &a.DocIDs); err != nil {
		return a, fmt.Errorf("kyc doc ids: %w", err)
	}
	if err := json.Unmarshal([]byte(series), &a.SeriesMints); err != nil {
		return a, fmt.Errorf("kyc series: %w", err)
	}
	a.Results = json.RawMessage(results)
	if by.Valid {
		a.DecidedBy = &by.Int64
	}
	if at.Valid {
		a.DecidedAt = &at.Int64
	}
	return a, nil
}

// CreateKyc files an application; a user with one under review gets ErrKycPending.
func (s *Store) CreateKyc(ctx context.Context, a KycApplication) (KycApplication, error) {
	docs, _ := json.Marshal(a.DocIDs)
	series, _ := json.Marshal(a.SeriesMints)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return KycApplication{}, fmt.Errorf("begin kyc: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	var open int
	if err := tx.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM kyc_applications WHERE user_id = ? AND status = 'submitted'`, a.UserID).Scan(&open); err != nil {
		return KycApplication{}, fmt.Errorf("open kyc: %w", err)
	}
	if open > 0 {
		return KycApplication{}, ErrKycPending
	}
	res, err := tx.ExecContext(ctx,
		`INSERT INTO kyc_applications (user_id, wallet, investor_type, residency, tax_bps, full_name, doc_ids,
		   series_mints, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
		a.UserID, a.Wallet, a.InvestorType, a.Residency, a.TaxBps, a.FullName, string(docs), string(series))
	if err != nil {
		return KycApplication{}, fmt.Errorf("insert kyc: %w", err)
	}
	id, _ := res.LastInsertId()
	if err := tx.Commit(); err != nil {
		return KycApplication{}, fmt.Errorf("commit kyc: %w", err)
	}
	return s.GetKyc(ctx, id)
}

// GetKyc returns one application (ErrNotFound if absent).
func (s *Store) GetKyc(ctx context.Context, id int64) (KycApplication, error) {
	a, err := scanKyc(s.db.QueryRowContext(ctx,
		`SELECT `+kycCols+` FROM kyc_applications k JOIN users u ON u.id = k.user_id WHERE k.id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return KycApplication{}, ErrNotFound
	} else if err != nil {
		return KycApplication{}, fmt.Errorf("get kyc %d: %w", id, err)
	}
	return a, nil
}

// LatestKyc returns a user's newest application (ErrNotFound when they never applied).
func (s *Store) LatestKyc(ctx context.Context, userID int64) (KycApplication, error) {
	a, err := scanKyc(s.db.QueryRowContext(ctx,
		`SELECT `+kycCols+` FROM kyc_applications k JOIN users u ON u.id = k.user_id
		 WHERE k.user_id = ? ORDER BY k.id DESC LIMIT 1`, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return KycApplication{}, ErrNotFound
	} else if err != nil {
		return KycApplication{}, fmt.Errorf("latest kyc: %w", err)
	}
	return a, nil
}

// ListKyc returns applications in a status ("" = all), oldest first (a review queue).
func (s *Store) ListKyc(ctx context.Context, status string) ([]KycApplication, error) {
	q := `SELECT ` + kycCols + ` FROM kyc_applications k JOIN users u ON u.id = k.user_id`
	args := []any{}
	if status != "" {
		q += ` WHERE k.status = ?`
		args = append(args, status)
	}
	rows, err := s.db.QueryContext(ctx, q+` ORDER BY k.id`, args...)
	if err != nil {
		return nil, fmt.Errorf("list kyc: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := []KycApplication{}
	for rows.Next() {
		a, err := scanKyc(rows)
		if err != nil {
			return nil, fmt.Errorf("scan kyc: %w", err)
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// RecordKycResults stores per-series results of an approval attempt without deciding (partial failure).
func (s *Store) RecordKycResults(ctx context.Context, id int64, results json.RawMessage) error {
	if _, err := s.db.ExecContext(ctx, `UPDATE kyc_applications SET results = ? WHERE id = ?`, string(results), id); err != nil {
		return fmt.Errorf("record kyc results: %w", err)
	}
	return nil
}

// DecideKyc approves or rejects an application under review (ErrKycDecided otherwise).
func (s *Store) DecideKyc(ctx context.Context, id int64, status, reason string, results json.RawMessage, by, at int64) error {
	if results == nil {
		results = json.RawMessage(`[]`)
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE kyc_applications SET status = ?, reason = ?, results = ?, decided_by = ?, decided_at = ?
		 WHERE id = ? AND status = 'submitted'`, status, reason, string(results), by, at, id)
	if err != nil {
		return fmt.Errorf("decide kyc: %w", err)
	}
	if n, _ := res.RowsAffected(); n != 1 {
		return ErrKycDecided
	}
	return nil
}
