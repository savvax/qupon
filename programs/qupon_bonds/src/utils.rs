use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    extension::{pausable::PausableConfig, BaseStateWithExtensions, StateWithExtensions},
    state::Mint as MintState,
};

use crate::error::QuponError;

/// Token-2022 Pausable flag of the bond mint (validated present in `init_series`).
pub fn mint_paused(mint: &AccountInfo) -> Result<bool> {
    let data = mint.try_borrow_data()?;
    let state = StateWithExtensions::<MintState>::unpack(&data)
        .map_err(|_| error!(QuponError::InvalidMintExtensions))?;
    let cfg = state
        .get_extension::<PausableConfig>()
        .map_err(|_| error!(QuponError::InvalidMintExtensions))?;
    Ok(bool::from(cfg.paused))
}

/// `units × price` in minor units, u128 intermediate.
pub fn mul_amount(units: u64, price: u64) -> Result<u64> {
    u64::try_from(u128::from(units) * u128::from(price))
        .map_err(|_| error!(QuponError::MathOverflow))
}

/// Registrar or paying agent (the "crank" roles in docs/02).
pub fn require_operator(series: &crate::state::Series, signer: &Pubkey) -> Result<()> {
    require!(
        *signer == series.registrar || *signer == series.paying_agent,
        QuponError::Unauthorized
    );
    Ok(())
}

/// Create a program-owned PDA account even if someone pre-funded its address (griefing-safe `create_account`).
pub fn create_pda_account<'info>(
    payer: &AccountInfo<'info>,
    target: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    space: usize,
    seeds: &[&[u8]],
) -> Result<()> {
    use anchor_lang::system_program::{
        allocate, assign, create_account, transfer, Allocate, Assign, CreateAccount, Transfer,
    };
    let rent = Rent::get()?.minimum_balance(space);
    let sys = system_program.key();
    let signer: &[&[&[u8]]] = &[seeds];
    if target.lamports() == 0 {
        return create_account(
            CpiContext::new_with_signer(
                sys,
                CreateAccount {
                    from: payer.clone(),
                    to: target.clone(),
                },
                signer,
            ),
            rent,
            space as u64,
            &crate::ID,
        );
    }
    let short = rent.saturating_sub(target.lamports());
    if short > 0 {
        transfer(
            CpiContext::new(
                sys,
                Transfer {
                    from: payer.clone(),
                    to: target.clone(),
                },
            ),
            short,
        )?;
    }
    allocate(
        CpiContext::new_with_signer(
            sys,
            Allocate {
                account_to_allocate: target.clone(),
            },
            signer,
        ),
        space as u64,
    )?;
    assign(
        CpiContext::new_with_signer(
            sys,
            Assign {
                account_to_assign: target.clone(),
            },
            signer,
        ),
        &crate::ID,
    )
}
