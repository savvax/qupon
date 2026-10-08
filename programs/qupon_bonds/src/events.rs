//! One event per state transition (docs/02-architecture.md). Every event carries `slot` and `timestamp`;
//! action events also carry `action` and `index`, plus the fields a seev.031/036 message needs.
use anchor_lang::prelude::*;

#[event]
pub struct SeriesInitialized {
    pub series: Pubkey,
    pub mint: Pubkey,
    pub cash_mint: Pubkey,
    pub registrar: Pubkey,
    pub issuer: Pubkey,
    pub paying_agent: Pubkey,
    pub isin: [u8; 12],
    pub ticker: [u8; 16],
    pub face_value: u64,
    pub coupon_rate_bps: u32,
    pub frequency: u8,
    pub day_count: u8,
    pub issue_date: i64,
    pub maturity_date: i64,
    pub next_coupon_date: i64,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct InvestorRegistered {
    pub series: Pubkey,
    pub investor: Pubkey,
    pub owner: Pubkey,
    pub bond_ata: Pubkey,
    pub cash_ata: Pubkey,
    pub investor_type: u8,
    pub residency: u8,
    pub tax_rate_bps: u16,
    pub kyc_ref: [u8; 32],
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct InvestorStatusChanged {
    pub series: Pubkey,
    pub investor: Pubkey,
    pub owner: Pubkey,
    pub status: u8,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct Subscribed {
    pub series: Pubkey,
    pub owner: Pubkey,
    pub units: u64,
    pub price_per_unit: u64,
    pub cash_paid: u64,
    pub total_issued: u64,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct UnitsIssued {
    pub series: Pubkey,
    pub owner: Pubkey,
    pub units: u64,
    pub total_issued: u64,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct ActionAnnounced {
    pub series: Pubkey,
    pub action: Pubkey,
    pub index: u32,
    pub kind: u8,
    pub mandatory: u8,
    pub corp_id: [u8; 16],
    /// COAF (ISO OffclCorpActnEvtId), may be empty.
    pub official_id: [u8; 16],
    pub record_at: i64,
    pub payment_at: i64,
    pub period_start: i64,
    pub period_end: i64,
    pub accrual_days: u32,
    pub rate_bps: u32,
    pub per_unit_gross: u64,
    pub per_unit_principal: u64,
    pub factor_bps: u16,
    pub cash_mint: Pubkey,
    pub escrow: Pubkey,
    pub proposal_new_rate_bps: u32,
    pub proposal_new_maturity: i64,
    pub voting_ends_at: i64,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct ActionCancelled {
    pub series: Pubkey,
    pub action: Pubkey,
    pub index: u32,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct RecordStruck {
    pub series: Pubkey,
    pub action: Pubkey,
    pub index: u32,
    pub record_at: i64,
    pub snapshot_slot: u64,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct HolderSnapshotted {
    pub series: Pubkey,
    pub action: Pubkey,
    pub index: u32,
    pub owner: Pubkey,
    pub bond_ata: Pubkey,
    pub units: u64,
    pub gross: u64,
    pub tax: u64,
    pub net: u64,
    pub principal: u64,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct SnapshotFinalized {
    pub series: Pubkey,
    pub action: Pubkey,
    pub index: u32,
    pub units_snapshotted: u64,
    pub holders_snapshotted: u32,
    pub total_gross: u64,
    pub total_tax: u64,
    pub total_net: u64,
    pub snapshot_hash: [u8; 32],
    pub status: u8,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct ActionFunded {
    pub series: Pubkey,
    pub action: Pubkey,
    pub index: u32,
    pub funder: Pubkey,
    pub amount: u64,
    pub escrow_balance: u64,
    pub required: u64,
    pub fully_funded: bool,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct EntitlementPaid {
    pub series: Pubkey,
    pub action: Pubkey,
    pub index: u32,
    pub owner: Pubkey,
    pub cash_ata: Pubkey,
    pub units: u64,
    pub gross: u64,
    pub tax: u64,
    pub net: u64,
    pub principal: u64,
    pub paid: u64,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct ActionCompleted {
    pub series: Pubkey,
    pub action: Pubkey,
    pub index: u32,
    pub kind: u8,
    pub status: u8,
    pub holders_paid: u32,
    pub total_paid: u64,
    pub next_coupon_date: i64,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct EscrowSwept {
    pub series: Pubkey,
    pub action: Pubkey,
    pub index: u32,
    pub amount: u64,
    pub to: Pubkey,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct UnitsRetired {
    pub series: Pubkey,
    pub action: Pubkey,
    pub index: u32,
    pub owner: Pubkey,
    pub units: u64,
    pub total_retired: u64,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct SeriesClosed {
    pub series: Pubkey,
    pub mint: Pubkey,
    pub action: Pubkey,
    pub index: u32,
    pub total_retired: u64,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct VoteCast {
    pub series: Pubkey,
    pub action: Pubkey,
    pub index: u32,
    pub owner: Pubkey,
    pub choice: u8,
    pub weight: u64,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct MeetingFinalized {
    pub series: Pubkey,
    pub action: Pubkey,
    pub index: u32,
    pub votes_for: u64,
    pub votes_against: u64,
    pub votes_abstain: u64,
    pub units_snapshotted: u64,
    pub result: u8,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct TermsChanged {
    pub series: Pubkey,
    pub action: Pubkey,
    pub index: u32,
    pub old_rate_bps: u32,
    pub new_rate_bps: u32,
    pub old_maturity: i64,
    pub new_maturity: i64,
    /// ARDFM registration is SIMULATED by the registrar signature.
    pub regulator_registration_simulated: bool,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct TradeAdmitted {
    pub series: Pubkey,
    pub swap_dvp: Pubkey,
    pub escrow: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub units: u64,
    pub cash_amount: u64,
    pub open_trades: u32,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct TradeReleased {
    pub series: Pubkey,
    pub swap_dvp: Pubkey,
    pub escrow: Pubkey,
    /// Units a forced release moved back to the seller (0 for a settled or cancelled trade).
    pub returned_units: u64,
    pub open_trades: u32,
    pub slot: u64,
    pub timestamp: i64,
}
