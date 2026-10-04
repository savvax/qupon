pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

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

    /// Reconcile and resume the mint; INTR completes and advances the schedule, redemptions go to Retiring.
    pub fn complete_action(ctx: Context<CompleteAction>) -> Result<()> {
        instructions::settle::handle_complete_action(ctx)
    }
}
