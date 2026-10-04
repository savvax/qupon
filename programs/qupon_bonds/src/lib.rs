pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;

declare_id!("QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd");

#[program]
pub mod qupon_bonds {
    use super::*;

    /// Create a bond series over a pre-configured Token-2022 mint (registrar).
    pub fn init_series(ctx: Context<InitSeries>, params: InitSeriesParams) -> Result<()> {
        instructions::init_series::handle_init_series(ctx, params)
    }
}
