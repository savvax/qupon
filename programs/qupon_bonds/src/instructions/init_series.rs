use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{
        spl_token_2022::{
            extension::{
                default_account_state::DefaultAccountState, metadata_pointer::MetadataPointer,
                mint_close_authority::MintCloseAuthority, pausable::PausableConfig,
                permanent_delegate::PermanentDelegate, BaseStateWithExtensions, ExtensionType,
                StateWithExtensions,
            },
            state::{AccountState, Mint as MintState},
        },
        Token2022,
    },
    token_2022_extensions::spl_token_metadata_interface::state::TokenMetadata,
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use entitlement::{DayCount, Ymd};

use crate::{
    constants::*,
    error::{math_err, QuponError},
    events::SeriesInitialized,
    state::{Series, SeriesStatus},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitSeriesParams {
    pub issuer: Pubkey,
    pub paying_agent: Pubkey,
    pub isin: [u8; 12],
    pub ticker: [u8; 16],
    pub face_value: u64,
    pub coupon_rate_bps: u32,
    pub frequency: u8,
    pub day_count: u8,
    /// Almaty midnight of the issue date, as a unix timestamp.
    pub issue_date: i64,
    pub maturity_date: i64,
    pub quorum_bps: u16,
    pub approval_bps: u16,
}

#[derive(Accounts)]
pub struct InitSeries<'info> {
    #[account(mut)]
    pub registrar: Signer<'info>,
    /// Bond mint, created client-side; extensions and authorities are validated in the handler.
    #[account(mint::token_program = bond_token_program)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// Settlement currency (tKZT on Token-2022 or USDC on SPL Token).
    #[account(mint::token_program = cash_token_program)]
    pub cash_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = registrar,
        space = 8 + Series::INIT_SPACE,
        seeds = [SERIES_SEED, mint.key().as_ref()],
        bump
    )]
    pub series: Box<Account<'info, Series>>,
    #[account(
        init,
        payer = registrar,
        associated_token::mint = cash_mint,
        associated_token::authority = series,
        associated_token::token_program = cash_token_program
    )]
    pub tax_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub bond_token_program: Program<'info, Token2022>,
    pub cash_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_init_series(ctx: Context<InitSeries>, p: InitSeriesParams) -> Result<()> {
    let series_key = ctx.accounts.series.key();
    validate_bond_mint(
        &ctx.accounts.mint.to_account_info(),
        &series_key,
        &ctx.accounts.registrar.key(),
    )?;

    require!(
        matches!(p.frequency, 1 | 2 | 4 | 12),
        QuponError::InvalidParams
    );
    require!(p.face_value > 0, QuponError::InvalidParams);
    require!(
        p.quorum_bps <= BPS_DENOMINATOR && p.approval_bps <= BPS_DENOMINATOR,
        QuponError::InvalidParams
    );
    DayCount::try_from(p.day_count)
        .and_then(DayCount::basis)
        .map_err(math_err)?;
    require!(
        is_almaty_midnight(p.issue_date) && is_almaty_midnight(p.maturity_date),
        QuponError::InvalidDates
    );
    let next_coupon_date = add_months_almaty(p.issue_date, 12 / u32::from(p.frequency))?;
    require!(
        next_coupon_date <= p.maturity_date,
        QuponError::InvalidDates
    );

    let s = &mut ctx.accounts.series;
    s.bump = ctx.bumps.series;
    s.mint = ctx.accounts.mint.key();
    s.cash_mint = ctx.accounts.cash_mint.key();
    s.registrar = ctx.accounts.registrar.key();
    s.issuer = p.issuer;
    s.paying_agent = p.paying_agent;
    s.isin = p.isin;
    s.ticker = p.ticker;
    s.face_value = p.face_value;
    s.coupon_rate_bps = p.coupon_rate_bps;
    s.frequency = p.frequency;
    s.day_count = p.day_count;
    s.issue_date = p.issue_date;
    s.maturity_date = p.maturity_date;
    s.next_coupon_date = next_coupon_date;
    s.period_start = p.issue_date;
    s.status = SeriesStatus::Active as u8;
    s.total_issued = 0;
    s.action_count = 0;
    s.quorum_bps = p.quorum_bps;
    s.approval_bps = p.approval_bps;
    s.tax_vault = ctx.accounts.tax_vault.key();

    let clock = Clock::get()?;
    emit!(SeriesInitialized {
        series: series_key,
        mint: s.mint,
        cash_mint: s.cash_mint,
        registrar: s.registrar,
        issuer: s.issuer,
        paying_agent: s.paying_agent,
        isin: s.isin,
        ticker: s.ticker,
        face_value: s.face_value,
        coupon_rate_bps: s.coupon_rate_bps,
        frequency: s.frequency,
        day_count: s.day_count,
        issue_date: s.issue_date,
        maturity_date: s.maturity_date,
        next_coupon_date,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}

/// The bond mint must be configured exactly as docs/02-architecture.md says:
/// series PDA = mint/freeze/pause/close authority and permanent delegate, accounts frozen by default,
/// metadata stored in the mint itself with the registrar as update authority, 0 decimals, nothing minted yet.
fn validate_bond_mint(mint: &AccountInfo, series: &Pubkey, registrar: &Pubkey) -> Result<()> {
    let data = mint.try_borrow_data()?;
    let state = StateWithExtensions::<MintState>::unpack(&data)
        .map_err(|_| error!(QuponError::InvalidMintExtensions))?;
    let missing = |_| error!(QuponError::InvalidMintExtensions);

    // Allowlist: any other extension (transfer hook, fee, non-transferable, …) could change behaviour after validation.
    let types = state.get_extension_types().map_err(missing)?;
    require!(
        types.iter().all(|t| matches!(
            t,
            ExtensionType::MetadataPointer
                | ExtensionType::TokenMetadata
                | ExtensionType::DefaultAccountState
                | ExtensionType::PermanentDelegate
                | ExtensionType::Pausable
                | ExtensionType::MintCloseAuthority
        )),
        QuponError::InvalidMintExtensions
    );

    let pointer = state.get_extension::<MetadataPointer>().map_err(missing)?;
    require!(
        Option::<Pubkey>::from(pointer.metadata_address) == Some(mint.key()),
        QuponError::InvalidMintExtensions
    );
    let default_state = state
        .get_extension::<DefaultAccountState>()
        .map_err(missing)?;
    require!(
        default_state.state == AccountState::Frozen as u8,
        QuponError::InvalidMintExtensions
    );
    let delegate = state
        .get_extension::<PermanentDelegate>()
        .map_err(missing)?;
    let pausable = state.get_extension::<PausableConfig>().map_err(missing)?;
    let close = state
        .get_extension::<MintCloseAuthority>()
        .map_err(missing)?;
    let metadata = state
        .get_variable_len_extension::<TokenMetadata>()
        .map_err(missing)?;
    require!(state.base.decimals == 0, QuponError::InvalidMintExtensions);
    require!(state.base.supply == 0, QuponError::SupplyNotZero);
    require!(!bool::from(pausable.paused), QuponError::MintPaused);

    let pda = Some(*series);
    require!(
        Option::<Pubkey>::from(delegate.delegate) == pda
            && Option::<Pubkey>::from(pausable.authority) == pda
            && Option::<Pubkey>::from(close.close_authority) == pda
            && Option::<Pubkey>::from(state.base.mint_authority) == pda
            && Option::<Pubkey>::from(state.base.freeze_authority) == pda,
        QuponError::InvalidAuthority
    );
    require!(
        Option::<Pubkey>::from(metadata.update_authority) == Some(*registrar),
        QuponError::InvalidAuthority
    );
    Ok(())
}

/// Period boundaries and series dates are Almaty midnights (03-domain §1, §3).
pub fn is_almaty_midnight(ts: i64) -> bool {
    ts.checked_add(ALMATY_UTC_OFFSET_SECS)
        .is_some_and(|t| t.rem_euclid(86_400) == 0)
}

/// Same Almaty-local time `months` later (end-of-month clamped). Period boundaries are Almaty midnights.
pub fn add_months_almaty(ts: i64, months: u32) -> Result<i64> {
    let local = ts
        .checked_add(ALMATY_UTC_OFFSET_SECS)
        .ok_or(QuponError::MathOverflow)?;
    let next = Ymd::from_unix_utc(local)
        .and_then(|d| d.add_months(months))
        .map_err(math_err)?;
    next.days_from_epoch()
        .checked_mul(86_400)
        .and_then(|x| x.checked_add(local.rem_euclid(86_400)))
        .and_then(|x| x.checked_sub(ALMATY_UTC_OFFSET_SECS))
        .ok_or_else(|| error!(QuponError::MathOverflow))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Almaty midnight of a civil date, built independently of `add_months_almaty`.
    fn almaty(y: u16, m: u8, d: u8) -> i64 {
        Ymd::new(y, m, d).unwrap().days_from_epoch() * 86_400 - ALMATY_UTC_OFFSET_SECS
    }

    #[test]
    fn add_months_keeps_almaty_midnight_and_clamps() {
        assert_eq!(almaty(2026, 7, 3), 1_783_018_800);
        for ((y, m, d), months, (y2, m2, d2)) in [
            ((2026, 7, 3), 6, (2027, 1, 3)),
            ((2026, 8, 31), 6, (2027, 2, 28)), // UTC date is Aug 30 — offset must be applied
            ((2027, 8, 31), 6, (2028, 2, 29)),
            ((2026, 1, 31), 1, (2026, 2, 28)),
            ((2026, 12, 31), 3, (2027, 3, 31)),
            ((2026, 3, 1), 1, (2026, 4, 1)), // UTC date is Feb 28
        ] {
            let got = add_months_almaty(almaty(y, m, d), months).unwrap();
            assert_eq!(got, almaty(y2, m2, d2), "{y}-{m}-{d} + {months}");
            assert!(is_almaty_midnight(got));
        }
        assert!(!is_almaty_midnight(almaty(2026, 7, 3) + 3600));
    }
}
