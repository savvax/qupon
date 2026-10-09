use anchor_lang::prelude::*;

/// Error names are part of the contract (docs/02-architecture.md); never rename or reorder — codes are positional.
#[error_code]
pub enum QuponError {
    #[msg("Signer is not the required authority")]
    Unauthorized,
    #[msg("Bond mint is missing a required Token-2022 extension or has a wrong configuration")]
    InvalidMintExtensions,
    #[msg("Mint or extension authority is not the series PDA (or registrar for metadata)")]
    InvalidAuthority,
    #[msg("Investor is not active")]
    InvestorNotActive,
    #[msg("Investor is suspended")]
    InvestorSuspended,
    #[msg("Series is not active")]
    SeriesNotActive,
    #[msg("Another corporate action is still open for this series")]
    ActionAlreadyOpen,
    #[msg("Dates are not ordered or not valid")]
    InvalidDates,
    #[msg("Too early for this step")]
    TooEarly,
    #[msg("Action is in the wrong status for this step")]
    WrongStatus,
    #[msg("Bond mint must be paused")]
    MintNotPaused,
    #[msg("Bond mint is paused")]
    MintPaused,
    #[msg("Token account mint does not match")]
    AccountMintMismatch,
    #[msg("Token account owner does not match")]
    AccountOwnerMismatch,
    #[msg("Snapshotted units do not equal mint supply")]
    SupplyMismatch,
    #[msg("Escrow does not hold enough funds")]
    Underfunded,
    #[msg("Already processed")]
    AlreadyProcessed,
    #[msg("Nothing to do")]
    NothingToDo,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Sum of holder entitlements drifts beyond rounding tolerance")]
    RoundingDrift,
    #[msg("Voting is closed")]
    VotingClosed,
    #[msg("Voting is still open")]
    VotingOpen,
    #[msg("Holder already voted")]
    AlreadyVoted,
    #[msg("Quorum not reached")]
    NoQuorum,
    #[msg("Proposal not approved")]
    NotApproved,
    #[msg("Mint supply is not zero")]
    SupplyNotZero,
    #[msg("Batch too large")]
    BatchTooLarge,
    #[msg("Client-supplied entitlement figures do not match on-chain computation")]
    EntitlementCalcMismatch,
    #[msg("Day count convention not supported (ACT/ACT is reserved)")]
    UnsupportedDayCount,
    #[msg("Invalid parameter")]
    InvalidParams,
    #[msg("Not every snapshotted holder has been paid in full")]
    PaymentsIncomplete,
    #[msg("KYC attestation missing, expired or not matching the investor")]
    KycAttestationInvalid,
    #[msg("Admitted secondary trades are open; settle or cancel and release them before the record date")]
    TradesInFlight,
    #[msg("The trade's bond escrow still holds units; settle or cancel it, or force the release")]
    TradeStillOpen,
    #[msg("Not a Solana DvP trade of this series between its registered investors under our settlement authority")]
    InvalidTrade,
    #[msg("Transfer-hook execute called outside a Token-2022 transfer")]
    NotTransferring,
    #[msg("Record date passed: snapshot this holder's position before moving bonds")]
    HolderNotSnapshotted,
    #[msg("Record date of a redemption passed: the register is locked")]
    RecordLocked,
    #[msg("A record date is pending: no units can be issued until its snapshot is final")]
    RecordPending,
    #[msg("Not every position (investor or admitted escrow) has been snapshotted yet")]
    PositionsIncomplete,
    #[msg("The mint carries the record-date transfer hook: run init_hook before registering investors")]
    HookNotArmed,
    #[msg("Not overdue yet: a default needs the payment date plus one series day without full funding")]
    NotOverdue,
    #[msg("Bank-routed payouts await the paying agent's confirmation")]
    BankPayoutsPending,
}

/// Map the pure math crate's errors onto program errors (orphan rule forbids `From`).
pub fn math_err(e: entitlement::Error) -> Error {
    match e {
        entitlement::Error::Overflow => error!(QuponError::MathOverflow),
        entitlement::Error::UnsupportedDayCount => error!(QuponError::UnsupportedDayCount),
        entitlement::Error::InvalidDate | entitlement::Error::InvalidPeriod => {
            error!(QuponError::InvalidDates)
        }
        entitlement::Error::InvalidCode => error!(QuponError::InvalidParams),
    }
}
