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
});
u8_enum!(EntitlementStatus { Snapshotted = 0, Paid = 1, Retired = 2 });
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
    pub reserved: [u8; 64],
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
    pub reserved: [u8; 64],
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
