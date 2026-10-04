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
}
