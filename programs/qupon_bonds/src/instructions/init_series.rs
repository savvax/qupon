use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{
        spl_token_2022::{
            extension::{
                default_account_state::DefaultAccountState, metadata_pointer::MetadataPointer,
                mint_close_authority::MintCloseAuthority, pausable::PausableConfig,
                permanent_delegate::PermanentDelegate, transfer_hook::TransferHook,
                BaseStateWithExtensions, ExtensionType, StateWithExtensions,
            },
            state::{AccountState, Mint as MintState},
        },
        Token2022,
    },
    token_2022_extensions::spl_token_metadata_interface::state::TokenMetadata,
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use entitlement::DayCount;

use crate::{
    clock::SeriesClock,
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
    /// 0 = real clock (Almaty midnights); 1..86 399 s per civil day = demo clock (plan 15 D7).
    pub day_secs: u32,
    /// Packed `yyyymmdd` of the issue civil date (demo clock anchor; 0 = derive from `issue_date`).
    pub issue_ymd: u32,
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
    /// `init_if_needed`: a pre-created ATA for the (predictable) series PDA must not block init_series.
    #[account(
        init_if_needed,
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

    // ISIN: 12 ASCII alphanumerics; ticker: printable ASCII, zero-padded.
    require!(
        p.isin.iter().all(u8::is_ascii_alphanumeric),
        QuponError::InvalidParams
    );
    let len = p
        .ticker
        .iter()
        .position(|&b| b == 0)
        .unwrap_or(p.ticker.len());
    require!(
        len > 0
            && p.ticker[..len].iter().all(u8::is_ascii_graphic)
            && p.ticker[len..].iter().all(|&b| b == 0),
        QuponError::InvalidParams
    );
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
    let series_clock = SeriesClock::from_params(p.day_secs, p.issue_date, p.issue_ymd)?;
    // Real clock: `issue_date` must be an Almaty midnight; `issue_ymd` is derived from it on-chain (the
    // argument is ignored unless non-zero, then it must agree). Demo clock: any instant anchors the
    // calendar at `issue_ymd` (plan 15 D7), so both arguments are stored as given.
    let issue_ymd = if p.day_secs == 0 {
        require!(
            series_clock.is_midnight(p.issue_date),
            QuponError::InvalidDates
        );
        let derived = series_clock.civil(p.issue_date)?;
        let packed =
            u32::from(derived.y) * 10_000 + u32::from(derived.m) * 100 + u32::from(derived.d);
        if p.issue_ymd != 0 {
            require!(p.issue_ymd == packed, QuponError::InvalidDates);
        }
        packed
    } else {
        p.issue_ymd
    };
    require!(
        series_clock.is_midnight(p.maturity_date),
        QuponError::InvalidDates
    );
    let next_coupon_date = series_clock.add_months(p.issue_date, 12 / u32::from(p.frequency))?;
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
    s.day_secs = p.day_secs;
    s.issue_ymd = issue_ymd;
    s.next_coupon_date = next_coupon_date;
    s.period_start = p.issue_date;
    s.status = SeriesStatus::Active as u8;
    s.total_issued = 0;
    s.action_count = 0;
    s.quorum_bps = p.quorum_bps;
    s.approval_bps = p.approval_bps;
    s.tax_vault = ctx.accounts.tax_vault.key();
    s.open_action = None;

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
                | ExtensionType::TransferHook
        )),
        QuponError::InvalidMintExtensions
    );
    // A transfer hook is allowed only if it is this program (the record-date gate) and nobody but the series can
    // re-point it.
    if let Ok(hook) = state.get_extension::<TransferHook>() {
        require!(
            Option::<Pubkey>::from(hook.program_id) == Some(crate::ID),
            QuponError::InvalidMintExtensions
        );
        require!(
            Option::<Pubkey>::from(hook.authority).is_none_or(|k| k == *series),
            QuponError::InvalidAuthority
        );
    }

    let pointer = state.get_extension::<MetadataPointer>().map_err(missing)?;
    require!(
        Option::<Pubkey>::from(pointer.metadata_address) == Some(mint.key()),
        QuponError::InvalidMintExtensions
    );
    // Only the registrar (or nobody) may re-point the metadata elsewhere.
    require!(
        Option::<Pubkey>::from(pointer.authority).is_none_or(|k| k == *registrar),
        QuponError::InvalidAuthority
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
