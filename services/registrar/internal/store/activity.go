package store

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// Activity is one decoded on-chain event. SeriesMint holds the series PDA and
// ActionPDA the action PDA from the event payload (nullable: series-level
// events have no action). Payload is the full decoded event as JSON.
type Activity struct {
	ID         int64           `json:"id"`
	Ts         int64           `json:"ts"`
	SeriesMint *string         `json:"series_mint"`
	ActionPDA  *string         `json:"action_pda"`
	Kind       string          `json:"kind"`
	Payload    json.RawMessage `json:"payload"`
	Sig        string          `json:"sig"`
	Slot       uint64          `json:"slot"`
	Seq        int             `json:"seq"`
}

// InsertActivity appends an activity row; INSERT OR IGNORE on (sig, kind, seq)
// makes repeated ingests of the same transaction idempotent. Returns false if
// the row was already present.
func (s *Store) InsertActivity(ctx context.Context, a Activity) (bool, error) {
	res, err := s.db.ExecContext(ctx,
		`INSERT OR IGNORE INTO activity (ts, series_mint, action_pda, kind, payload, sig, slot, seq)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		a.Ts, a.SeriesMint, a.ActionPDA, a.Kind, []byte(a.Payload), a.Sig, a.Slot, a.Seq)
	if err != nil {
		return false, fmt.Errorf("insert activity: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("insert activity rows affected: %w", err)
	}
	return n > 0, nil
}

// ListActivity returns the newest `limit` events in chain order (oldest first).
func (s *Store) ListActivity(ctx context.Context, limit int) ([]Activity, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT * FROM (
			SELECT id, ts, series_mint, action_pda, kind, payload, sig, slot, seq
			FROM activity ORDER BY id DESC LIMIT ?
		) ORDER BY id ASC`, limit)
	if err != nil {
		return nil, fmt.Errorf("list activity: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var out []Activity
	for rows.Next() {
		var a Activity
		if err := rows.Scan(&a.ID, &a.Ts, &a.SeriesMint, &a.ActionPDA, &a.Kind,
			&a.Payload, &a.Sig, &a.Slot, &a.Seq); err != nil {
			return nil, fmt.Errorf("scan activity: %w", err)
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ActionSignatures returns the distinct transaction signatures of an action's
// settlement events (EntitlementPaid, ActionCompleted) in chain order
// (oldest first, newest last); implements notice.Activity.
func (s *Store) ActionSignatures(ctx context.Context, pda string) ([]string, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT sig, MIN(id) FROM activity
		 WHERE action_pda = ? AND kind IN ('EntitlementPaid', 'ActionCompleted')
		 GROUP BY sig ORDER BY MIN(id)`, pda)
	if err != nil {
		return nil, fmt.Errorf("action signatures: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var out []string
	for rows.Next() {
		var sig string
		var first int64
		if err := rows.Scan(&sig, &first); err != nil {
			return nil, fmt.Errorf("scan action signature: %w", err)
		}
		out = append(out, sig)
	}
	return out, rows.Err()
}

// HolderPaidTx maps action PDA → the transaction signature that moved this holder's payout: the first
// EntitlementPaid or PaidToAgent row (id order) whose decoded payload names the owner (task 1525).
// Best effort — the feed only holds what the poller ingested; a missing row just means no tx shown.
func (s *Store) HolderPaidTx(ctx context.Context, owner string, actions []string) (map[string]string, error) {
	out := map[string]string{}
	if len(actions) == 0 {
		return out, nil
	}
	qs := make([]string, len(actions))
	args := make([]any, len(actions))
	for i, a := range actions {
		qs[i] = "?"
		args[i] = a
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT action_pda, payload, sig FROM activity
		 WHERE kind IN ('EntitlementPaid', 'PaidToAgent') AND action_pda IN (`+strings.Join(qs, ",")+`)
		 ORDER BY id`, args...)
	if err != nil {
		return nil, fmt.Errorf("holder paid tx: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var action, sig string
		var payload []byte
		if err := rows.Scan(&action, &payload, &sig); err != nil {
			return nil, fmt.Errorf("scan holder paid tx: %w", err)
		}
		var ev struct {
			Owner string `json:"owner"`
		}
		if json.Unmarshal(payload, &ev) != nil || ev.Owner != owner {
			continue
		}
		if _, done := out[action]; !done { // first row = the payout itself, not a later retry
			out[action] = sig
		}
	}
	return out, rows.Err()
}

// BankPayout is the activity-feed view of one holder's bank-routed payout (plan 15 D6): the escrow's
// transfer to the paying agent (PaidToAgent) and, once the agent confirms the SIMULATED bank transfer,
// the confirmation transaction and the sha256 reference hash (BankPayoutConfirmed).
type BankPayout struct {
	Owner         string
	AgentTx       string // signature of the PaidToAgent transaction
	ConfirmTx     string // signature of the BankPayoutConfirmed transaction, "" while awaiting
	ReferenceHash string // sha256 hex of the bank transfer reference
}

// BankPayouts maps action PDA → owner → bank payout, from the ingested PaidToAgent/BankPayoutConfirmed
// rows of the given actions (first row per owner wins, like HolderPaidTx). Best effort: the feed only
// holds what the poller ingested; a missing row just means the statement shows no bank annotation.
func (s *Store) BankPayouts(ctx context.Context, actions []string) (map[string]map[string]BankPayout, error) {
	out := map[string]map[string]BankPayout{}
	if len(actions) == 0 {
		return out, nil
	}
	qs := make([]string, len(actions))
	args := make([]any, len(actions))
	for i, a := range actions {
		qs[i] = "?"
		args[i] = a
	}
	rows, err := s.db.QueryContext(ctx,
		`SELECT action_pda, kind, payload, sig FROM activity
		 WHERE kind IN ('PaidToAgent', 'BankPayoutConfirmed') AND action_pda IN (`+strings.Join(qs, ",")+`)
		 ORDER BY id`, args...)
	if err != nil {
		return nil, fmt.Errorf("bank payouts: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var action, kind, sig string
		var payload []byte
		if err := rows.Scan(&action, &kind, &payload, &sig); err != nil {
			return nil, fmt.Errorf("scan bank payout: %w", err)
		}
		var ev struct {
			Owner         string `json:"owner"`
			ReferenceHash string `json:"reference_hash"` // ingest: base64 of the raw 32 bytes
		}
		if json.Unmarshal(payload, &ev) != nil || ev.Owner == "" {
			continue
		}
		byOwner := out[action]
		if byOwner == nil {
			byOwner = map[string]BankPayout{}
			out[action] = byOwner
		}
		p := byOwner[ev.Owner]
		switch kind {
		case "PaidToAgent":
			if p.AgentTx == "" { // first row = the payout itself, not a later retry
				p.AgentTx = sig
			}
		case "BankPayoutConfirmed":
			if p.ConfirmTx == "" {
				p.ConfirmTx, p.ReferenceHash = sig, hexHash(ev.ReferenceHash)
			}
		}
		byOwner[ev.Owner] = p
	}
	return out, rows.Err()
}

// hexHash renders the ingest reference hash (base64 of 32 raw bytes) as hex, like every other hash the
// API exposes (PayoutRoute.BankRefHash); a non-decodable value is passed through untouched.
func hexHash(s string) string {
	if raw, err := base64.StdEncoding.DecodeString(s); err == nil && len(raw) == 32 {
		return hex.EncodeToString(raw)
	}
	return s
}

// ActionSettlement is the issuer-report view of one action's funding timeline (plan 15 D4): the last
// ActionFunded row's required vs escrow balance, the default stamp and the cure with its lateness.
type ActionSettlement struct {
	Required    uint64
	Funded      uint64
	DefaultedAt int64
	CuredAt     int64 // timestamp of the DefaultCured event
	LateSeconds int64
}

// ActionSettlement replays the action's funding events (ingested ActionFunded/ActionDefaulted/DefaultCured
// rows, newest wins). Best effort like BankPayouts: with no rows everything stays zero.
func (s *Store) ActionSettlement(ctx context.Context, pda string) (ActionSettlement, error) {
	var out ActionSettlement
	rows, err := s.db.QueryContext(ctx,
		`SELECT kind, payload, ts FROM activity
		 WHERE action_pda = ? AND kind IN ('ActionFunded', 'ActionDefaulted', 'DefaultCured')
		 ORDER BY id`, pda)
	if err != nil {
		return out, fmt.Errorf("action settlement: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var kind string
		var payload []byte
		var ts int64
		if err := rows.Scan(&kind, &payload, &ts); err != nil {
			return out, fmt.Errorf("scan action settlement: %w", err)
		}
		// u64 fields arrive as decimal strings (ingest keeps them JS-safe).
		var ev struct {
			Required      string `json:"required"`
			EscrowBalance string `json:"escrow_balance"`
			DefaultedAt   int64  `json:"defaulted_at"`
			LateSecs      int64  `json:"late_secs"`
		}
		if json.Unmarshal(payload, &ev) != nil {
			continue
		}
		switch kind {
		case "ActionFunded":
			out.Required, out.Funded = parseU64(ev.Required), parseU64(ev.EscrowBalance)
		case "ActionDefaulted":
			out.DefaultedAt = ev.DefaultedAt
		case "DefaultCured":
			out.CuredAt, out.LateSeconds = ts, ev.LateSecs
		}
	}
	return out, rows.Err()
}

func parseU64(s string) uint64 {
	v, _ := strconv.ParseUint(s, 10, 64)
	return v
}

// ActionSwept reports whether an escrow sweep is already recorded for the
// action: a registrar follow-up row (advance:/scheduler:sweep_escrow) or the
// ingested on-chain EscrowSwept event — a manual CLI sweep counts too (task 1422).
func (s *Store) ActionSwept(ctx context.Context, pda string) (bool, error) {
	var one int
	err := s.db.QueryRowContext(ctx,
		`SELECT 1 FROM activity
		 WHERE action_pda = ? AND (kind LIKE '%:sweep_escrow' OR kind = 'EscrowSwept')
		 LIMIT 1`, pda).Scan(&one)
	if err == sql.ErrNoRows {
		return false, nil
	} else if err != nil {
		return false, fmt.Errorf("action swept: %w", err)
	}
	return true, nil
}

// IngestCursor returns the persisted newest-processed signature ("" if none).
func (s *Store) IngestCursor(ctx context.Context) (string, error) {
	var cur string
	err := s.db.QueryRowContext(ctx, `SELECT last_sig FROM ingest_state WHERE id = 1`).Scan(&cur)
	if err == sql.ErrNoRows {
		return "", nil
	} else if err != nil {
		return "", fmt.Errorf("read ingest cursor: %w", err)
	}
	return cur, nil
}

// SetIngestCursor persists the newest-processed signature.
func (s *Store) SetIngestCursor(ctx context.Context, sig string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO ingest_state (id, last_sig, updated_at) VALUES (1, ?, unixepoch())
		 ON CONFLICT(id) DO UPDATE SET last_sig = excluded.last_sig, updated_at = excluded.updated_at`, sig)
	if err != nil {
		return fmt.Errorf("set ingest cursor: %w", err)
	}
	return nil
}
