use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use entitlement::{DayCount, Ymd};

use crate::{
    clock::SeriesClock,
    constants::*,
    error::{math_err, QuponError},
    events::{ActionAnnounced, ActionCancelled},
    state::{
        ActionKind, ActionStatus, CorporateAction, Mandatory, MeetingResult, Series, SeriesStatus,
    },
};

/// Announcement parameters. Amounts are recomputed on-chain; client-supplied figures must agree.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AnnounceArgs {
    /// [`ActionKind`] code (CHAN is not announced: it results from an approved BMET).
    pub kind: u8,
    /// [`Mandatory`] code; must be MAND for cash events and VOLU for BMET.
    pub mandatory: u8,
    pub corp_id: [u8; 16],
    pub official_id: [u8; 16],
    pub record_at: i64,
    pub payment_at: i64,
    /// Civil dates `yyyymmdd` used for day counting (03-domain §3).
    pub period_start_ymd: u32,
    pub period_end_ymd: u32,
    /// The same dates as Almaty-midnight unix timestamps (clock checks, schedule).
    pub period_start_ts: i64,
    pub period_end_ts: i64,
    pub accrual_days: u32,
    pub rate_bps: u32,
    /// PCAL only.
    pub factor_bps: u16,
    /// BMET only.
    pub proposal_new_rate_bps: u32,
    pub proposal_new_maturity: i64,
    pub voting_ends_at: i64,
}

#[derive(Accounts)]
pub struct AnnounceAction<'info> {
    /// Registrar for cash events, issuer for BMET (checked in the handler).
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = cash_mint,
        constraint = series.status == SeriesStatus::Active as u8 @ QuponError::SeriesNotActive
    )]
    pub series: Box<Account<'info, Series>>,
    #[account(
        init,
        payer = authority,
        space = 8 + CorporateAction::INIT_SPACE,
        seeds = [ACTION_SEED, series.key().as_ref(), &series.action_count.to_le_bytes()],
        bump
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    pub cash_mint: Box<InterfaceAccount<'info, Mint>>,
    /// `init_if_needed`: anyone can pre-create the ATA of the (predictable) next action PDA; that must not block announcements.
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = cash_mint,
        associated_token::authority = action,
        associated_token::token_program = cash_token_program
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    pub cash_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_announce_action(ctx: Context<AnnounceAction>, a: AnnounceArgs) -> Result<()> {
    let series = &ctx.accounts.series;
    let kind = ActionKind::try_from(a.kind)?;
    let authority = ctx.accounts.authority.key();
    let (expected_signer, expected_mandatory) = match kind {
        ActionKind::Meeting => (series.issuer, Mandatory::Voluntary),
        ActionKind::TermsChange => return err!(QuponError::InvalidParams),
        _ => (series.registrar, Mandatory::Mandatory),
    };
    require_keys_eq!(authority, expected_signer, QuponError::Unauthorized);
    require!(
        a.mandatory == expected_mandatory as u8,
        QuponError::InvalidParams
    );
    require!(series.open_action.is_none(), QuponError::ActionAlreadyOpen);

    let now = Clock::get()?.unix_timestamp;
    let clock = SeriesClock::of(series)?;
    require!(
        now < a.record_at && a.record_at <= a.payment_at,
        QuponError::InvalidDates
    );

    let mut per_unit_gross = 0;
    let mut per_unit_principal = 0;
    let mut accrual_days = 0;
    if kind == ActionKind::Meeting {
        require!(a.voting_ends_at > a.record_at, QuponError::InvalidDates);
        require!(
            a.proposal_new_rate_bps > 0 || a.proposal_new_maturity > 0,
            QuponError::InvalidParams
        );
        // No cash fields on a meeting; a proposed rate above 100% or a maturity in the past is nonsense.
        require!(
            a.rate_bps == 0
                && a.accrual_days == 0
                && a.factor_bps == 0
                && a.period_start_ts == 0
                && a.period_end_ts == 0
                && a.proposal_new_rate_bps <= u32::from(BPS_DENOMINATOR),
            QuponError::InvalidParams
        );
        require!(
            a.proposal_new_maturity == 0 || a.proposal_new_maturity > now,
            QuponError::InvalidDates
        );
    } else {
        require!(
            a.proposal_new_rate_bps == 0 && a.proposal_new_maturity == 0 && a.voting_ends_at == 0,
            QuponError::InvalidParams
        );
        require!(
            a.factor_bps == 0 || kind == ActionKind::PartialRedemption,
            QuponError::InvalidParams
        );
        let dc = DayCount::try_from(series.day_count).map_err(math_err)?;
        let start = civil_matches(&clock, a.period_start_ymd, a.period_start_ts)?;
        let end = civil_matches(&clock, a.period_end_ymd, a.period_end_ts)?;
        let days = entitlement::accrual_days(dc, start, end).map_err(math_err)?;
        require!(days == a.accrual_days, QuponError::EntitlementCalcMismatch);
        // The current coupon period always starts where the last one ended; the rate is a series term.
        require!(
            a.period_start_ts == series.period_start && a.rate_bps == series.coupon_rate_bps,
            QuponError::EntitlementCalcMismatch
        );
        match kind {
            ActionKind::Interest => require!(
                a.period_end_ts == series.next_coupon_date,
                QuponError::EntitlementCalcMismatch
            ),
            ActionKind::Redemption => require!(
                a.period_end_ts == series.maturity_date,
                QuponError::EntitlementCalcMismatch
            ),
            // Early/partial call: accrued coupon for a partial period that ends before the next coupon date.
            _ => require!(
                a.period_start_ts < a.period_end_ts
                    && a.period_end_ts <= series.next_coupon_date
                    && a.period_end_ts < series.maturity_date,
                QuponError::InvalidDates
            ),
        }
        per_unit_gross = entitlement::per_unit_gross(series.face_value, a.rate_bps, dc, days)
            .map_err(math_err)?;
        per_unit_principal = match kind {
            ActionKind::Redemption | ActionKind::EarlyRedemption => series.face_value,
            ActionKind::PartialRedemption => {
                require!(
                    a.factor_bps > 0 && a.factor_bps < BPS_DENOMINATOR,
                    QuponError::InvalidParams
                );
                let p = entitlement::round_half_up(
                    u128::from(series.face_value) * u128::from(a.factor_bps),
                    u128::from(BPS_DENOMINATOR),
                );
                u64::try_from(p).map_err(|_| error!(QuponError::MathOverflow))?
            }
            _ => 0,
        };
        accrual_days = days;
    }

    let action_key = ctx.accounts.action.key();
    let act = &mut ctx.accounts.action;
    act.bump = ctx.bumps.action;
    act.series = series.key();
    act.index = series.action_count;
    act.kind = a.kind;
    act.mandatory = a.mandatory;
    act.corp_id = a.corp_id;
    act.official_id = a.official_id;
    act.announced_at = now;
    act.record_at = a.record_at;
    act.payment_at = a.payment_at;
    act.period_start = a.period_start_ts;
    act.period_end = a.period_end_ts;
    act.accrual_days = accrual_days;
    act.rate_bps = a.rate_bps;
    act.per_unit_gross = per_unit_gross;
    act.per_unit_principal = per_unit_principal;
    act.cash_mint = series.cash_mint;
    act.escrow = ctx.accounts.escrow.key();
    act.status = ActionStatus::Announced as u8;
    act.proposal_new_rate_bps = a.proposal_new_rate_bps;
    act.proposal_new_maturity = a.proposal_new_maturity;
    act.voting_ends_at = a.voting_ends_at;
    act.result = MeetingResult::Pending as u8;
    act.factor_bps = a.factor_bps;
    act.hash_scheme = 1;

    let series = &mut ctx.accounts.series;
    series.action_count = series
        .action_count
        .checked_add(1)
        .ok_or(QuponError::MathOverflow)?;
    series.open_action = Some(action_key);
    if series.hook == 1 {
        // A redemption locks the register from record_at: an open DvP escrow could never settle, release or burn.
        require!(
            !matches!(kind, ActionKind::Redemption | ActionKind::EarlyRedemption)
                || series.open_trades == 0,
            QuponError::TradesInFlight
        );
        // Hooked series: arm the transfer-hook gate for this record (plan 15 D1').
        series.record_kind = act.kind;
        series.record_seq = act.index.checked_add(1).ok_or(QuponError::MathOverflow)?;
        series.record_at = act.record_at;
        series.ckpt_late = 0;
    }

    let clock = Clock::get()?;
    emit!(ActionAnnounced {
        series: series.key(),
        action: action_key,
        index: act.index,
        kind: act.kind,
        mandatory: act.mandatory,
        corp_id: act.corp_id,
        record_at: act.record_at,
        payment_at: act.payment_at,
        period_start: act.period_start,
        period_end: act.period_end,
        accrual_days: act.accrual_days,
        rate_bps: act.rate_bps,
        per_unit_gross,
        per_unit_principal,
        official_id: act.official_id,
        factor_bps: act.factor_bps,
        cash_mint: act.cash_mint,
        escrow: act.escrow,
        proposal_new_rate_bps: act.proposal_new_rate_bps,
        proposal_new_maturity: act.proposal_new_maturity,
        voting_ends_at: act.voting_ends_at,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}

/// `ymd` must be the calendar date of the midnight timestamp `ts` on the series clock (real: Almaty
/// midnights, 03-domain §3; demo: the series' compressed days, plan 15 D7).
fn civil_matches(clock: &SeriesClock, ymd: u32, ts: i64) -> Result<Ymd> {
    let date = Ymd::from_packed(ymd).map_err(math_err)?;
    require!(clock.civil(ts)? == date, QuponError::InvalidDates);
    Ok(date)
}

#[derive(Accounts)]
pub struct CancelAction<'info> {
    pub registrar: Signer<'info>,
    #[account(mut, has_one = registrar @ QuponError::Unauthorized)]
    pub series: Box<Account<'info, Series>>,
    #[account(
        mut,
        seeds = [ACTION_SEED, series.key().as_ref(), &action.index.to_le_bytes()],
        bump = action.bump,
        has_one = series
    )]
    pub action: Box<Account<'info, CorporateAction>>,
}

pub fn handle_cancel_action(ctx: Context<CancelAction>) -> Result<()> {
    let act = &mut ctx.accounts.action;
    require!(
        act.status == ActionStatus::Announced as u8,
        QuponError::WrongStatus
    );
    act.status = ActionStatus::Cancelled as u8;
    act.completed_at = Clock::get()?.unix_timestamp;
    let series = &mut ctx.accounts.series;
    series.open_action = None;
    // Disarm the transfer-hook gate (hooked series); a cancelled record never locks anybody.
    series.record_at = 0;

    let clock = Clock::get()?;
    emit!(ActionCancelled {
        series: act.series,
        action: act.key(),
        index: act.index,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}
