// Hand-written Borsh decoders for the four qupon_bonds accounts.
// Field order mirrors the Rust layout in programs/qupon_bonds/src/state.rs
// (docs/02-architecture.md); encoders live only in tests.
package chain

import (
	"encoding/binary"
	"fmt"

	"github.com/qupon-kz/qupon/services/registrar/internal/borsh"
	solana "github.com/solana-foundation/solana-go/v2"
)

// DecodeSeries decodes a Series account (after the 8-byte discriminator).
func DecodeSeries(data []byte) (*Series, error) {
	r := borsh.NewReader(data)
	var s Series
	var err error
	if s.Bump, err = r.U8(); err != nil {
		return nil, fmt.Errorf("series: bump: %w", err)
	}
	if s.Mint, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("series: mint: %w", err)
	}
	if s.CashMint, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("series: cash_mint: %w", err)
	}
	if s.Registrar, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("series: registrar: %w", err)
	}
	if s.Issuer, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("series: issuer: %w", err)
	}
	if s.PayingAgent, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("series: paying_agent: %w", err)
	}
	if s.ISIN, err = fixed12(r); err != nil {
		return nil, fmt.Errorf("series: isin: %w", err)
	}
	if s.Ticker, err = fixed16(r); err != nil {
		return nil, fmt.Errorf("series: ticker: %w", err)
	}
	if s.FaceValue, err = r.U64(); err != nil {
		return nil, fmt.Errorf("series: face_value: %w", err)
	}
	if s.CouponRateBps, err = r.U32(); err != nil {
		return nil, fmt.Errorf("series: coupon_rate_bps: %w", err)
	}
	if s.Frequency, err = r.U8(); err != nil {
		return nil, fmt.Errorf("series: frequency: %w", err)
	}
	if s.DayCount, err = r.U8(); err != nil {
		return nil, fmt.Errorf("series: day_count: %w", err)
	}
	if s.IssueDate, err = r.I64(); err != nil {
		return nil, fmt.Errorf("series: issue_date: %w", err)
	}
	if s.MaturityDate, err = r.I64(); err != nil {
		return nil, fmt.Errorf("series: maturity_date: %w", err)
	}
	if s.NextCouponDate, err = r.I64(); err != nil {
		return nil, fmt.Errorf("series: next_coupon_date: %w", err)
	}
	if s.PeriodStart, err = r.I64(); err != nil {
		return nil, fmt.Errorf("series: period_start: %w", err)
	}
	if s.Status, err = r.U8(); err != nil {
		return nil, fmt.Errorf("series: status: %w", err)
	}
	if s.TotalIssued, err = r.U64(); err != nil {
		return nil, fmt.Errorf("series: total_issued: %w", err)
	}
	if s.ActionCount, err = r.U32(); err != nil {
		return nil, fmt.Errorf("series: action_count: %w", err)
	}
	if s.QuorumBps, err = r.U16(); err != nil {
		return nil, fmt.Errorf("series: quorum_bps: %w", err)
	}
	if s.ApprovalBps, err = r.U16(); err != nil {
		return nil, fmt.Errorf("series: approval_bps: %w", err)
	}
	if s.TaxVault, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("series: tax_vault: %w", err)
	}
	opt, err := r.OptionPubkey()
	if err != nil {
		return nil, fmt.Errorf("series: open_action: %w", err)
	}
	if opt != nil {
		p := solana.PublicKey(*opt)
		s.OpenAction = &p
	}
	if s.OpenTrades, err = r.U32(); err != nil {
		return nil, fmt.Errorf("series: open_trades: %w", err)
	}
	reserved, err := r.Bytes(len(s.Reserved))
	if err != nil {
		return nil, fmt.Errorf("series: reserved: %w", err)
	}
	copy(s.Reserved[:], reserved)
	// Plan 15 D7 carve (after the hook fields): reserved[22:26] = day_secs, [26:30] = issue_ymd.
	s.DaySecs = binary.LittleEndian.Uint32(s.Reserved[22:26])
	s.IssueYmd = binary.LittleEndian.Uint32(s.Reserved[26:30])
	// The account is allocated at max size (open_action Some = 33 bytes); a None leaves 32 zero bytes at the end.
	if !r.Done() && (s.OpenAction != nil || r.Remaining() != 32 || !r.RestIsZero()) {
		return nil, fmt.Errorf("series: %d trailing bytes", r.Remaining())
	}
	return &s, nil
}

// DecodeInvestor decodes an Investor account (after the discriminator).
func DecodeInvestor(data []byte) (*Investor, error) {
	r := borsh.NewReader(data)
	var i Investor
	var err error
	if i.Bump, err = r.U8(); err != nil {
		return nil, fmt.Errorf("investor: bump: %w", err)
	}
	if i.Series, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("investor: series: %w", err)
	}
	if i.Owner, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("investor: owner: %w", err)
	}
	if i.BondATA, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("investor: bond_ata: %w", err)
	}
	if i.CashATA, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("investor: cash_ata: %w", err)
	}
	if i.InvestorType, err = r.U8(); err != nil {
		return nil, fmt.Errorf("investor: investor_type: %w", err)
	}
	if i.Residency, err = r.U8(); err != nil {
		return nil, fmt.Errorf("investor: residency: %w", err)
	}
	if i.TaxRateBps, err = r.U16(); err != nil {
		return nil, fmt.Errorf("investor: tax_rate_bps: %w", err)
	}
	if i.Status, err = r.U8(); err != nil {
		return nil, fmt.Errorf("investor: status: %w", err)
	}
	if i.KYCRef, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("investor: kyc_ref: %w", err)
	}
	if i.RegisteredAt, err = r.I64(); err != nil {
		return nil, fmt.Errorf("investor: registered_at: %w", err)
	}
	if !r.Done() {
		return nil, fmt.Errorf("investor: %d trailing bytes", r.Remaining())
	}
	return &i, nil
}

// DecodeTradeAdmission decodes a TradeAdmission account (after the discriminator).
func DecodeTradeAdmission(data []byte) (*TradeAdmission, error) {
	r := borsh.NewReader(data)
	var t TradeAdmission
	var err error
	if t.Bump, err = r.U8(); err != nil {
		return nil, fmt.Errorf("trade admission: bump: %w", err)
	}
	for _, f := range []struct {
		name string
		dst  *solana.PublicKey
	}{{"series", &t.Series}, {"swap_dvp", &t.SwapDvp}, {"escrow", &t.Escrow}, {"seller", &t.Seller}, {"buyer", &t.Buyer}} {
		if *f.dst, err = r.Pubkey(); err != nil {
			return nil, fmt.Errorf("trade admission: %s: %w", f.name, err)
		}
	}
	if t.Units, err = r.U64(); err != nil {
		return nil, fmt.Errorf("trade admission: units: %w", err)
	}
	if t.CashAmount, err = r.U64(); err != nil {
		return nil, fmt.Errorf("trade admission: cash_amount: %w", err)
	}
	if t.AdmittedAt, err = r.I64(); err != nil {
		return nil, fmt.Errorf("trade admission: admitted_at: %w", err)
	}
	if !r.Done() {
		return nil, fmt.Errorf("trade admission: %d trailing bytes", r.Remaining())
	}
	return &t, nil
}

// DecodeCorporateAction decodes a CorporateAction account (after the discriminator).
func DecodeCorporateAction(data []byte) (*CorporateAction, error) {
	r := borsh.NewReader(data)
	var a CorporateAction
	var err error
	if a.Bump, err = r.U8(); err != nil {
		return nil, fmt.Errorf("action: bump: %w", err)
	}
	if a.Series, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("action: series: %w", err)
	}
	if a.Index, err = r.U32(); err != nil {
		return nil, fmt.Errorf("action: index: %w", err)
	}
	if a.Kind, err = r.U8(); err != nil {
		return nil, fmt.Errorf("action: kind: %w", err)
	}
	if a.Mandatory, err = r.U8(); err != nil {
		return nil, fmt.Errorf("action: mandatory: %w", err)
	}
	if a.CorpID, err = fixed16(r); err != nil {
		return nil, fmt.Errorf("action: corp_id: %w", err)
	}
	if a.OfficialID, err = fixed16(r); err != nil {
		return nil, fmt.Errorf("action: official_id: %w", err)
	}
	if a.AnnouncedAt, err = r.I64(); err != nil {
		return nil, fmt.Errorf("action: announced_at: %w", err)
	}
	if a.RecordAt, err = r.I64(); err != nil {
		return nil, fmt.Errorf("action: record_at: %w", err)
	}
	if a.PaymentAt, err = r.I64(); err != nil {
		return nil, fmt.Errorf("action: payment_at: %w", err)
	}
	if a.PeriodStart, err = r.I64(); err != nil {
		return nil, fmt.Errorf("action: period_start: %w", err)
	}
	if a.PeriodEnd, err = r.I64(); err != nil {
		return nil, fmt.Errorf("action: period_end: %w", err)
	}
	if a.AccrualDays, err = r.U32(); err != nil {
		return nil, fmt.Errorf("action: accrual_days: %w", err)
	}
	if a.RateBps, err = r.U32(); err != nil {
		return nil, fmt.Errorf("action: rate_bps: %w", err)
	}
	if a.PerUnitGross, err = r.U64(); err != nil {
		return nil, fmt.Errorf("action: per_unit_gross: %w", err)
	}
	if a.PerUnitPrincipal, err = r.U64(); err != nil {
		return nil, fmt.Errorf("action: per_unit_principal: %w", err)
	}
	if a.CashMint, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("action: cash_mint: %w", err)
	}
	if a.Escrow, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("action: escrow: %w", err)
	}
	if a.Status, err = r.U8(); err != nil {
		return nil, fmt.Errorf("action: status: %w", err)
	}
	if a.SnapshotSlot, err = r.U64(); err != nil {
		return nil, fmt.Errorf("action: snapshot_slot: %w", err)
	}
	if a.SnapshotHash, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("action: snapshot_hash: %w", err)
	}
	if a.UnitsSnapshotted, err = r.U64(); err != nil {
		return nil, fmt.Errorf("action: units_snapshotted: %w", err)
	}
	if a.HoldersSnapshotted, err = r.U32(); err != nil {
		return nil, fmt.Errorf("action: holders_snapshotted: %w", err)
	}
	if a.HoldersPaid, err = r.U32(); err != nil {
		return nil, fmt.Errorf("action: holders_paid: %w", err)
	}
	if a.TotalGross, err = r.U64(); err != nil {
		return nil, fmt.Errorf("action: total_gross: %w", err)
	}
	if a.TotalTax, err = r.U64(); err != nil {
		return nil, fmt.Errorf("action: total_tax: %w", err)
	}
	if a.TotalNet, err = r.U64(); err != nil {
		return nil, fmt.Errorf("action: total_net: %w", err)
	}
	if a.TotalPaid, err = r.U64(); err != nil {
		return nil, fmt.Errorf("action: total_paid: %w", err)
	}
	if a.TotalRetired, err = r.U64(); err != nil {
		return nil, fmt.Errorf("action: total_retired: %w", err)
	}
	if a.HoldersRetired, err = r.U32(); err != nil {
		return nil, fmt.Errorf("action: holders_retired: %w", err)
	}
	if a.ProposalNewRateBps, err = r.U32(); err != nil {
		return nil, fmt.Errorf("action: proposal_new_rate_bps: %w", err)
	}
	if a.ProposalNewMaturity, err = r.I64(); err != nil {
		return nil, fmt.Errorf("action: proposal_new_maturity: %w", err)
	}
	if a.VotingEndsAt, err = r.I64(); err != nil {
		return nil, fmt.Errorf("action: voting_ends_at: %w", err)
	}
	if a.VotesFor, err = r.U64(); err != nil {
		return nil, fmt.Errorf("action: votes_for: %w", err)
	}
	if a.VotesAgainst, err = r.U64(); err != nil {
		return nil, fmt.Errorf("action: votes_against: %w", err)
	}
	if a.VotesAbstain, err = r.U64(); err != nil {
		return nil, fmt.Errorf("action: votes_abstain: %w", err)
	}
	if a.Result, err = r.U8(); err != nil {
		return nil, fmt.Errorf("action: result: %w", err)
	}
	if a.CompletedAt, err = r.I64(); err != nil {
		return nil, fmt.Errorf("action: completed_at: %w", err)
	}
	if a.FactorBps, err = r.U16(); err != nil {
		return nil, fmt.Errorf("action: factor_bps: %w", err)
	}
	if a.TotalPrincipal, err = r.U64(); err != nil {
		return nil, fmt.Errorf("action: total_principal: %w", err)
	}
	if a.Reserved, err = fixed64(r); err != nil {
		return nil, fmt.Errorf("action: reserved: %w", err)
	}
	a.HashScheme = a.Reserved[0]
	if !r.Done() {
		return nil, fmt.Errorf("action: %d trailing bytes", r.Remaining())
	}
	return &a, nil
}

// DecodeEntitlement decodes an Entitlement account (after the discriminator).
func DecodeEntitlement(data []byte) (*Entitlement, error) {
	r := borsh.NewReader(data)
	var e Entitlement
	var err error
	if e.Bump, err = r.U8(); err != nil {
		return nil, fmt.Errorf("entitlement: bump: %w", err)
	}
	if e.Action, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("entitlement: action: %w", err)
	}
	if e.Owner, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("entitlement: owner: %w", err)
	}
	if e.Units, err = r.U64(); err != nil {
		return nil, fmt.Errorf("entitlement: units: %w", err)
	}
	if e.Gross, err = r.U64(); err != nil {
		return nil, fmt.Errorf("entitlement: gross: %w", err)
	}
	if e.Tax, err = r.U64(); err != nil {
		return nil, fmt.Errorf("entitlement: tax: %w", err)
	}
	if e.Net, err = r.U64(); err != nil {
		return nil, fmt.Errorf("entitlement: net: %w", err)
	}
	if e.Principal, err = r.U64(); err != nil {
		return nil, fmt.Errorf("entitlement: principal: %w", err)
	}
	if e.Status, err = r.U8(); err != nil {
		return nil, fmt.Errorf("entitlement: status: %w", err)
	}
	if e.PaidAt, err = r.I64(); err != nil {
		return nil, fmt.Errorf("entitlement: paid_at: %w", err)
	}
	if e.Vote, err = r.U8(); err != nil {
		return nil, fmt.Errorf("entitlement: vote: %w", err)
	}
	if e.VotedAt, err = r.I64(); err != nil {
		return nil, fmt.Errorf("entitlement: voted_at: %w", err)
	}
	if !r.Done() {
		return nil, fmt.Errorf("entitlement: %d trailing bytes", r.Remaining())
	}
	return &e, nil
}

func fixed12(r *borsh.Reader) ([12]byte, error) {
	b, err := r.Bytes(12)
	var out [12]byte
	copy(out[:], b)
	return out, err
}

func fixed16(r *borsh.Reader) ([16]byte, error) {
	b, err := r.Bytes(16)
	var out [16]byte
	copy(out[:], b)
	return out, err
}

func fixed64(r *borsh.Reader) ([64]byte, error) {
	b, err := r.Bytes(64)
	var out [64]byte
	copy(out[:], b)
	return out, err
}
