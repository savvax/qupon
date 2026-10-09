pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;
use spl_discriminator::SplDiscriminate;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

pub use instructions::*;
pub use state::*;

declare_id!("QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd");

#[program]
pub mod qupon_bonds {
    use super::*;

    /// Create a bond series over a pre-configured Token-2022 mint (registrar).
    pub fn init_series(ctx: Context<InitSeries>, params: InitSeriesParams) -> Result<()> {
        instructions::init_series::handle_init_series(ctx, params)
    }

    /// Record a KYC'd holder, create and thaw their bond ATA, create their cash ATA (registrar).
    pub fn register_investor(ctx: Context<RegisterInvestor>, kyc: KycParams) -> Result<()> {
        instructions::register_investor::handle_register_investor(ctx, kyc)
    }

    /// Freeze the holder's bond ATA (registrar).
    pub fn suspend_investor(ctx: Context<SetInvestorStatus>) -> Result<()> {
        instructions::register_investor::handle_set_investor_status(ctx, true)
    }

    /// Thaw the holder's bond ATA again (registrar).
    pub fn reinstate_investor(ctx: Context<SetInvestorStatus>) -> Result<()> {
        instructions::register_investor::handle_set_investor_status(ctx, false)
    }

    /// Primary placement, atomic DvP: pay `units × price_per_unit` cash, receive `units` bonds (investor).
    pub fn subscribe(ctx: Context<Subscribe>, units: u64, price_per_unit: u64) -> Result<()> {
        instructions::subscribe::handle_subscribe(ctx, units, price_per_unit)
    }

    /// Free allocation without cash (issuer).
    pub fn issue_units(ctx: Context<IssueUnits>, units: u64) -> Result<()> {
        instructions::subscribe::handle_issue_units(ctx, units)
    }

    /// Admit a Solana DvP trade between two registered investors: thaw its bond escrow (registrar or paying agent).
    pub fn admit_trade(ctx: Context<AdmitTrade>) -> Result<()> {
        instructions::trade::handle_admit_trade(ctx)
    }

    /// Drop the admission of a settled or cancelled trade; `force` first returns escrowed units to the seller
    /// (registrar or paying agent).
    pub fn release_trade(ctx: Context<ReleaseTrade>, force: bool) -> Result<()> {
        instructions::trade::handle_release_trade(ctx, force)
    }

    /// Announce a corporate action (registrar for INTR/REDM/MCAL/PCAL, issuer for BMET); amounts verified on-chain.
    pub fn announce_action(ctx: Context<AnnounceAction>, args: AnnounceArgs) -> Result<()> {
        instructions::announce_action::handle_announce_action(ctx, args)
    }

    /// Cancel an action that is still only Announced (registrar).
    pub fn cancel_action(ctx: Context<CancelAction>) -> Result<()> {
        instructions::announce_action::handle_cancel_action(ctx)
    }

    /// Record date reached: pause the bond mint (registrar or paying agent).
    pub fn strike_record(ctx: Context<StrikeRecord>) -> Result<()> {
        instructions::snapshot::handle_strike_record(ctx)
    }

    /// Snapshot up to 8 holders: remaining accounts = N × [Investor, bond ATA, Entitlement PDA] (crank).
    pub fn snapshot_batch<'info>(ctx: Context<'info, SnapshotBatch<'info>>) -> Result<()> {
        instructions::snapshot::handle_snapshot_batch(ctx)
    }

    /// Close the snapshot once Σ units == supply (BMET → VotingOpen).
    pub fn finalize_snapshot(ctx: Context<FinalizeSnapshot>) -> Result<()> {
        instructions::snapshot::handle_finalize_snapshot(ctx)
    }

    /// Move cash into the action escrow (issuer or paying agent); Funded once it covers net + tax + principal.
    pub fn fund_action(ctx: Context<FundAction>, amount: u64) -> Result<()> {
        instructions::settle::handle_fund_action(ctx, amount)
    }

    /// Pay up to 10 holders: remaining accounts = N × [Entitlement, Investor, holder cash ATA] (crank).
    pub fn pay_batch<'info>(ctx: Context<'info, PayBatch<'info>>) -> Result<()> {
        instructions::settle::handle_pay_batch(ctx)
    }

    /// Return a finished (Completed / Retiring / Cancelled) action's leftover escrow to the issuer and close it.
    pub fn sweep_escrow(ctx: Context<SweepEscrow>) -> Result<()> {
        instructions::settle::handle_sweep_escrow(ctx)
    }

    /// Reconcile and resume the mint; INTR and PCAL complete (PCAL lowers the outstanding face), full redemptions go
    /// to Retiring.
    pub fn complete_action(ctx: Context<CompleteAction>) -> Result<()> {
        instructions::settle::handle_complete_action(ctx)
    }

    /// Burn redeemed units: remaining accounts = N × [Entitlement, holder bond ATA], ≤ 12 (crank).
    pub fn retire_batch<'info>(ctx: Context<'info, RetireBatch<'info>>) -> Result<()> {
        instructions::retire::handle_retire_batch(ctx)
    }

    /// Supply is zero: mark metadata REDEEMED, close the mint, Series → Closed (registrar).
    pub fn close_series(ctx: Context<CloseSeries>) -> Result<()> {
        instructions::retire::handle_close_series(ctx)
    }

    /// Vote For (1) / Against (2) / Abstain (3) with the snapshotted units (holder).
    pub fn cast_vote(ctx: Context<CastVote>, choice: u8) -> Result<()> {
        instructions::meeting::handle_cast_vote(ctx, choice)
    }

    /// Close voting and record Approved / Rejected / NoQuorum (registrar).
    pub fn finalize_meeting(ctx: Context<FinalizeMeeting>) -> Result<()> {
        instructions::meeting::handle_finalize_meeting(ctx)
    }

    /// Apply an approved proposal to the series and its token metadata (registrar; ARDFM registration SIMULATED).
    pub fn apply_terms_change(ctx: Context<ApplyTermsChange>) -> Result<()> {
        instructions::meeting::handle_apply_terms_change(ctx)
    }

    /// Write the transfer-hook validation account and switch the series to the hook gate (registrar).
    pub fn init_hook(ctx: Context<InitHook>) -> Result<()> {
        instructions::hook::handle_init_hook(ctx)
    }

    /// Create an owner's checkpoint for a hooked series (anyone pays).
    pub fn init_checkpoint(ctx: Context<InitCheckpoint>, owner: Pubkey) -> Result<()> {
        instructions::hook::handle_init_checkpoint(ctx, owner)
    }

    /// SPIKE 1509: mark a position snapshotted for the pending record (anyone, after `record_at`).
    pub fn mark_snapshotted(ctx: Context<MarkSnapshotted>) -> Result<()> {
        instructions::hook::handle_mark_snapshotted(ctx)
    }

    /// Token-2022 transfer hook (spl-transfer-hook-interface `Execute`): the record-date gate.
    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        instructions::hook::handle_execute(ctx, amount)
    }
}
