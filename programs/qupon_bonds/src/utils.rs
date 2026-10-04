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
