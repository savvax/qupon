//! On-chain accounts and their u8 enums — layouts are the contract in docs/02-architecture.md.
use anchor_lang::prelude::*;

use crate::error::QuponError;

/// `#[repr(u8)]` enum stored as a plain `u8` field, with `TryFrom<u8>` (unknown code → `InvalidParams`).
macro_rules! u8_enum {
    ($(#[$m:meta])* $name:ident { $($v:ident = $n:literal),+ $(,)? }) => {
        $(#[$m])*
        #[derive(Clone, Copy, Debug, PartialEq, Eq)]
        #[repr(u8)]
        pub enum $name { $($v = $n),+ }

        impl TryFrom<u8> for $name {
            type Error = anchor_lang::error::Error;
            fn try_from(v: u8) -> Result<Self> {
                match v {
                    $($n => Ok(Self::$v),)+
                    _ => err!(QuponError::InvalidParams),
                }
            }
        }
    };
}

u8_enum!(SeriesStatus { Active = 0, Matured = 1, Retiring = 2, Closed = 3 });
u8_enum!(InvestorType { Individual = 0, Legal = 1 });
u8_enum!(Residency { Resident = 0, NonResident = 1 });
u8_enum!(InvestorStatus { Active = 0, Suspended = 1 });
u8_enum!(
    /// ISO 20022 event types INTR, REDM, MCAL, PCAL, BMET, CHAN.
    ActionKind { Interest = 0, Redemption = 1, EarlyRedemption = 2, PartialRedemption = 3, Meeting = 4, TermsChange = 5 }
);
u8_enum!(
    /// ISO 20022 MAND / VOLU / CHOS.
    Mandatory { Mandatory = 0, Voluntary = 1, Choice = 2 }
);
u8_enum!(ActionStatus {
    Announced = 0,
    RecordStruck = 1,
    SnapshotComplete = 2,
    Funded = 3,
    Settling = 4,
    Completed = 5,
    Retiring = 6,
    Cancelled = 7,
    VotingOpen = 8,
    Finalized = 9,
    Defaulted = 10,
});
u8_enum!(EntitlementStatus { Snapshotted = 0, Paid = 1, Retired = 2, PaidToAgent = 3 });
u8_enum!(PayoutRouteKind { Wallet = 0, Bank = 1 });
u8_enum!(VoteChoice { None = 0, For = 1, Against = 2, Abstain = 3 });
u8_enum!(MeetingResult { Pending = 0, Approved = 1, Rejected = 2, NoQuorum = 3 });

/// Seeds `["series", mint]`.
#[account]
#[derive(InitSpace)]
pub struct Series {
    pub bump: u8,
    pub mint: Pubkey,
    pub cash_mint: Pubkey,
    pub registrar: Pubkey,
    pub issuer: Pubkey,
    pub paying_agent: Pubkey,
    pub isin: [u8; 12],
    /// Zero-padded ASCII.
    pub ticker: [u8; 16],
    /// Minor units of `cash_mint` per bond.
    pub face_value: u64,
    pub coupon_rate_bps: u32,
    /// Coupons per year: 1, 2, 4 or 12.
    pub frequency: u8,
    /// 0 = THIRTY_360, 1 = ACT_ACT (rejected), 2 = ACT_365.
    pub day_count: u8,
    pub issue_date: i64,
    pub maturity_date: i64,
    pub next_coupon_date: i64,
    pub period_start: i64,
    /// [`SeriesStatus`].
    pub status: u8,
    pub total_issued: u64,
    pub action_count: u32,
    pub quorum_bps: u16,
    pub approval_bps: u16,
    /// ATA of the series PDA for `cash_mint`.
    pub tax_vault: Pubkey,
    /// The one non-final corporate action (statuses other than Completed/Cancelled), if any.
    pub open_action: Option<Pubkey>,
    /// Admitted Solana DvP trades not yet released; `strike_record` requires 0. Carved from `reserved`
    /// (64 zero bytes before), so the account size is unchanged and older series read 0.
    pub open_trades: u32,
    /// 1 = the mint's transfer hook is this program: the record date is enforced by the hook gate (plan 15 D1'),
    /// not by pausing the mint. Carved from `reserved`, like everything below.
    pub hook: u8,
    /// Hooked series: [`ActionKind`] of the pending record; redemptions lock the register from `record_at` on.
    pub record_kind: u8,
    /// Hooked series: sequence of the pending (or last) record = action index + 1; 0 = never.
    pub record_seq: u32,
    /// Hooked series: `record_at` of the pending record; 0 = none pending (cleared when the snapshot is final).
    pub record_at: i64,
    /// Hooked series: checkpoints in existence (registered investors + admitted DvP escrows).
    pub ckpt_count: u32,
    /// Hooked series: checkpoints created after the pending record's `record_at` (they start at its `record_seq`:
    /// nothing could be held in a frozen, unregistered ATA). Reset when a record is armed.
    pub ckpt_late: u32,
    /// Seconds per civil day: 0 = real clock (Almaty midnights), 1..86 399 = demo clock (plan 15 D7). Carved from
    /// `reserved` like the fields above, so the account size is unchanged.
    pub day_secs: u32,
    /// Packed `yyyymmdd` of the issue civil date — the demo clock's calendar anchor (0 = derive from `issue_date`).
    pub issue_ymd: u32,
    /// 1 while an action of this series is in default (plan 15 D4); cleared when it is cured.
    pub in_default: u8,
    /// Defaults ever declared on this series.
    pub defaults_count: u16,
    pub reserved: [u8; 27],
}

/// Seeds `["investor", series, owner]`.
#[account]
#[derive(InitSpace)]
pub struct Investor {
    pub bump: u8,
    pub series: Pubkey,
    pub owner: Pubkey,
    pub bond_ata: Pubkey,
    pub cash_ata: Pubkey,
    /// [`InvestorType`].
    pub investor_type: u8,
    /// [`Residency`].
    pub residency: u8,
    pub tax_rate_bps: u16,
    /// [`InvestorStatus`].
    pub status: u8,
    /// Hash of the off-chain KYC record (SIMULATED KYC).
    pub kyc_ref: [u8; 32],
    pub registered_at: i64,
}

/// Seeds `["action", series, action_index:u32 LE]`.
#[account]
#[derive(InitSpace)]
pub struct CorporateAction {
    pub bump: u8,
    pub series: Pubkey,
    pub index: u32,
    /// [`ActionKind`].
    pub kind: u8,
    /// [`Mandatory`].
    pub mandatory: u8,
    /// CORP id, e.g. `QPNb1-INTR-0001`.
    pub corp_id: [u8; 16],
    /// COAF (registrar/KASE-assigned), may be empty.
    pub official_id: [u8; 16],
    pub announced_at: i64,
    pub record_at: i64,
    pub payment_at: i64,
    pub period_start: i64,
    pub period_end: i64,
    pub accrual_days: u32,
    pub rate_bps: u32,
    /// Coupon part per unit (informational, rounded).
    pub per_unit_gross: u64,
    /// 0 for INTR.
    pub per_unit_principal: u64,
    pub cash_mint: Pubkey,
    /// ATA of the action PDA for `cash_mint`.
    pub escrow: Pubkey,
    /// [`ActionStatus`].
    pub status: u8,
    pub snapshot_slot: u64,
    pub snapshot_hash: [u8; 32],
    pub units_snapshotted: u64,
    pub holders_snapshotted: u32,
    pub holders_paid: u32,
    pub total_gross: u64,
    pub total_tax: u64,
    pub total_net: u64,
    pub total_paid: u64,
    pub total_retired: u64,
    pub holders_retired: u32,
    // meeting fields
    pub proposal_new_rate_bps: u32,
    pub proposal_new_maturity: i64,
    pub voting_ends_at: i64,
    pub votes_for: u64,
    pub votes_against: u64,
    pub votes_abstain: u64,
    /// [`MeetingResult`].
    pub result: u8,
    pub completed_at: i64,
    /// PCAL only: share of face redeemed, bps.
    pub factor_bps: u16,
    /// Σ holder principal (REDM/MCAL/PCAL); escrow must hold total_net + total_tax + total_principal.
    pub total_principal: u64,
    /// 0 = rolling `sha256(prev ‖ owner ‖ units)` over owner-sorted batches; 1 = order-independent set hash: XOR of
    /// `sha256("qupon:snap:v1" ‖ action ‖ owner ‖ units)` per holder (plan 15 D3).
    pub hash_scheme: u8,
    /// Hooked series: checkpoints advanced by this action's snapshot (completeness = positions_done + ckpt_late ==
    /// ckpt_count).
    pub positions_done: u32,
    /// When `declare_default` ran (0 = never); `cured_at` when funding later covered the shortfall.
    pub defaulted_at: i64,
    pub cured_at: i64,
    /// Bank-routed payouts handed to the paying agent but not yet confirmed (plan 15 D6); `complete_action` needs 0.
    pub bank_pending: u32,
    /// sha256 of the action's official notification (seev.031 XML), anchored once by the registrar (plan 15 D9).
    pub disclosure_hash: [u8; 32],
    pub reserved: [u8; 7],
}

/// Seeds `["entitlement", action, owner]`.
#[account]
#[derive(InitSpace)]
pub struct Entitlement {
    pub bump: u8,
    pub action: Pubkey,
    pub owner: Pubkey,
    pub units: u64,
    pub gross: u64,
    pub tax: u64,
    pub net: u64,
    pub principal: u64,
    /// [`EntitlementStatus`].
    pub status: u8,
    pub paid_at: i64,
    /// [`VoteChoice`].
    pub vote: u8,
    pub voted_at: i64,
}

/// Seeds `["trade", series, swap_dvp]` — one admitted Solana DvP trade; closed by `release_trade`.
#[account]
#[derive(InitSpace)]
pub struct TradeAdmission {
    pub bump: u8,
    pub series: Pubkey,
    /// The Solana DvP `SwapDvp` record.
    pub swap_dvp: Pubkey,
    /// Its bond-leg escrow (ATA of `swap_dvp`), thawed by `admit_trade`.
    pub escrow: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub units: u64,
    pub cash_amount: u64,
    pub admitted_at: i64,
}

/// Seeds `["ckpt", series, owner]` — hooked series: the last record this owner's position was snapshotted for. The
/// transfer hook lets the owner's bonds move after a `record_at` only once `last_seq` reached that record.
#[account]
#[derive(InitSpace)]
pub struct Checkpoint {
    pub bump: u8,
    pub series: Pubkey,
    pub owner: Pubkey,
    pub last_seq: u32,
}

/// Seeds `["route", investor]` — where the holder wants payouts to go (plan 15 D6). Set only by the holder's own
/// signature; absent = their registered wallet cash account. Bank: the paying agent receives the payout and
/// confirms the (SIMULATED) bank transfer with a reference hash.
#[account]
#[derive(InitSpace)]
pub struct PayoutRoute {
    pub bump: u8,
    pub investor: Pubkey,
    /// [`PayoutRouteKind`].
    pub route: u8,
    /// sha256 of the holder's bank details (never stored in clear); zero for the wallet route.
    pub bank_ref_hash: [u8; 32],
    pub updated_at: i64,
}
