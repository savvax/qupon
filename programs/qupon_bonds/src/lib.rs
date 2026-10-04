use anchor_lang::prelude::*;

declare_id!("QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd");

#[program]
pub mod qupon_bonds {
    use super::*;

    /// Liveness check used by the scaffold test; replaced by real instructions from task 005 on.
    pub fn ping(_ctx: Context<Ping>) -> Result<()> {
        msg!("pong");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Ping {}
