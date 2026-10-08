//! Settlement (03-domain §1–§2): issuer pre-funds the escrow, the crank pays holders in batches, then the
//! action is reconciled and the register resumed.
use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_2022_extensions::{pausable_resume, PausableToggle},
    token_interface::{
        close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
        TransferChecked,
    },
};
use entitlement::Ymd;

use crate::{
    constants::*,
    error::{math_err, QuponError},
    events::{ActionCompleted, ActionFunded, EntitlementPaid, EscrowSwept},
    instructions::init_series::add_months_almaty,
    state::{
        ActionKind, ActionStatus, CorporateAction, Entitlement, EntitlementStatus, Investor,
        Series, SeriesStatus,
    },
    utils::require_operator,
};

/// Max `[Entitlement, Investor, holder cash ATA]` triples per `pay_batch` (docs/02 batch sizing).
pub const PAY_BATCH_MAX: usize = 10;

/// What the escrow must hold before anyone is paid.
pub fn required_funding(a: &CorporateAction) -> Result<u64> {
    a.total_net
        .checked_add(a.total_tax)
        .and_then(|x| x.checked_add(a.total_principal))
        .ok_or_else(|| error!(QuponError::MathOverflow))
}

#[derive(Accounts)]
pub struct FundAction<'info> {
    /// Issuer or paying agent (checked in the handler).
    pub funder: Signer<'info>,
    #[account(has_one = cash_mint)]
    pub series: Box<Account<'info, Series>>,
    #[account(
        mut,
        seeds = [ACTION_SEED, series.key().as_ref(), &action.index.to_le_bytes()],
        bump = action.bump,
        has_one = series,
        has_one = escrow
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    pub cash_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = cash_mint,
        token::authority = funder,
        token::token_program = cash_token_program
    )]
    pub funder_cash: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    pub cash_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_fund_action(ctx: Context<FundAction>, amount: u64) -> Result<()> {
    let series = &ctx.accounts.series;
    let funder = ctx.accounts.funder.key();
    require!(
        funder == series.issuer || funder == series.paying_agent,
        QuponError::Unauthorized
    );
    let status = ctx.accounts.action.status;
    require!(
        status == ActionStatus::SnapshotComplete as u8 || status == ActionStatus::Funded as u8,
        QuponError::WrongStatus
    );
    require!(amount > 0, QuponError::NothingToDo);
    // Never take more than the shortfall: a surplus would sit under the action PDA (sweep_escrow returns strays).
    let shortfall =
        required_funding(&ctx.accounts.action)?.saturating_sub(ctx.accounts.escrow.amount);
    let amount = amount.min(shortfall);
    require!(amount > 0, QuponError::NothingToDo);

    transfer_checked(
        CpiContext::new(
            ctx.accounts.cash_token_program.key(),
            TransferChecked {
                from: ctx.accounts.funder_cash.to_account_info(),
                mint: ctx.accounts.cash_mint.to_account_info(),
                to: ctx.accounts.escrow.to_account_info(),
                authority: ctx.accounts.funder.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.cash_mint.decimals,
    )?;
    ctx.accounts.escrow.reload()?;

    let action = &mut ctx.accounts.action;
    let required = required_funding(action)?;
    let balance = ctx.accounts.escrow.amount;
    let fully_funded = balance >= required;
    if fully_funded {
        action.status = ActionStatus::Funded as u8;
    }
    let clock = Clock::get()?;
    emit!(ActionFunded {
        series: action.series,
        action: action.key(),
        index: action.index,
        funder,
        amount,
        escrow_balance: balance,
        required,
        fully_funded,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct PayBatch<'info> {
    pub authority: Signer<'info>,
    #[account(has_one = cash_mint, has_one = tax_vault)]
    pub series: Box<Account<'info, Series>>,
    #[account(
        mut,
        seeds = [ACTION_SEED, series.key().as_ref(), &action.index.to_le_bytes()],
        bump = action.bump,
        has_one = series,
        has_one = escrow
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    pub cash_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub tax_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub cash_token_program: Interface<'info, TokenInterface>,
}

/// `remaining_accounts` = N × [Entitlement (writable), Investor, holder cash ATA (writable)]. Idempotent: entitlements
/// already Paid are skipped.
pub fn handle_pay_batch<'info>(ctx: Context<'info, PayBatch<'info>>) -> Result<()> {
    require_operator(&ctx.accounts.series, &ctx.accounts.authority.key())?;
    let status = ctx.accounts.action.status;
    require!(
        status != ActionStatus::SnapshotComplete as u8,
        QuponError::Underfunded
    );
    require!(
        status == ActionStatus::Funded as u8 || status == ActionStatus::Settling as u8,
        QuponError::WrongStatus
    );
    let rem = ctx.remaining_accounts;
    require!(rem.len().is_multiple_of(3), QuponError::InvalidParams);
    require!(rem.len() / 3 <= PAY_BATCH_MAX, QuponError::BatchTooLarge);

    let action_key = ctx.accounts.action.key();
    let series_key = ctx.accounts.series.key();
    let index_le = ctx.accounts.action.index.to_le_bytes();
    let bump = [ctx.accounts.action.bump];
    let seeds: &[&[u8]] = &[ACTION_SEED, series_key.as_ref(), &index_le, &bump];
    let clock = Clock::get()?;

    for t in rem.chunks(3) {
        // Read fresh from account data each time so a holder listed twice in one batch is paid once.
        let mut ent: Account<Entitlement> = Account::try_from(&t[0])?;
        require_keys_eq!(ent.action, action_key, QuponError::InvalidParams);
        let investor: Account<Investor> = Account::try_from(&t[1])?;
        require_keys_eq!(
            investor.series,
            series_key,
            QuponError::AccountOwnerMismatch
        );
        require_keys_eq!(investor.owner, ent.owner, QuponError::AccountOwnerMismatch);
        require_keys_eq!(
            t[2].key(),
            investor.cash_ata,
            QuponError::AccountOwnerMismatch
        );
        if ent.status != EntitlementStatus::Snapshotted as u8 {
            continue;
        }

        let payout = ent
            .net
            .checked_add(ent.principal)
            .ok_or(QuponError::MathOverflow)?;
        let pay = |to: &AccountInfo<'info>, amount: u64| -> Result<()> {
            if amount == 0 {
                return Ok(());
            }
            transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.cash_token_program.key(),
                    TransferChecked {
                        from: ctx.accounts.escrow.to_account_info(),
                        mint: ctx.accounts.cash_mint.to_account_info(),
                        to: to.clone(),
                        authority: ctx.accounts.action.to_account_info(),
                    },
                    &[seeds],
                ),
                amount,
                ctx.accounts.cash_mint.decimals,
            )
        };
        pay(&t[2], payout)?;
        pay(&ctx.accounts.tax_vault.to_account_info(), ent.tax)?;

        ent.status = EntitlementStatus::Paid as u8;
        ent.paid_at = clock.unix_timestamp;
        ent.exit(&crate::ID)?;

        let action = &mut ctx.accounts.action;
        action.holders_paid = action
            .holders_paid
            .checked_add(1)
            .ok_or(QuponError::MathOverflow)?;
        action.total_paid = action
            .total_paid
            .checked_add(payout)
            .ok_or(QuponError::MathOverflow)?;
        action.status = ActionStatus::Settling as u8;
        emit!(EntitlementPaid {
            series: series_key,
            action: action_key,
            index: action.index,
            owner: ent.owner,
            cash_ata: t[2].key(),
            units: ent.units,
            gross: ent.gross,
            tax: ent.tax,
            net: ent.net,
            principal: ent.principal,
            paid: payout,
            slot: clock.slot,
            timestamp: clock.unix_timestamp,
        });
    }
    Ok(())
}

#[derive(Accounts)]
pub struct CompleteAction<'info> {
    pub authority: Signer<'info>,
    #[account(mut, has_one = mint)]
    pub series: Box<Account<'info, Series>>,
    #[account(
        mut,
        seeds = [ACTION_SEED, series.key().as_ref(), &action.index.to_le_bytes()],
        bump = action.bump,
        has_one = series
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub bond_token_program: Program<'info, Token2022>,
}

pub fn handle_complete_action(ctx: Context<CompleteAction>) -> Result<()> {
    require_operator(&ctx.accounts.series, &ctx.accounts.authority.key())?;
    let action = &ctx.accounts.action;
    require!(
        action.status == ActionStatus::Settling as u8,
        QuponError::WrongStatus
    );
    // Reconciliation: every snapshotted holder paid, and exactly net + principal left the escrow to holders.
    require!(
        action.holders_paid == action.holders_snapshotted
            && action.total_paid
                == action
                    .total_net
                    .checked_add(action.total_principal)
                    .ok_or(QuponError::MathOverflow)?,
        QuponError::PaymentsIncomplete
    );

    let mint = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[SERIES_SEED, mint.as_ref(), &[ctx.accounts.series.bump]];
    pausable_resume(CpiContext::new_with_signer(
        ctx.accounts.bond_token_program.key(),
        PausableToggle {
            token_program_id: ctx.accounts.bond_token_program.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.series.to_account_info(),
        },
        &[seeds],
    ))?;

    let clock = Clock::get()?;
    let kind = ActionKind::try_from(ctx.accounts.action.kind)?;
    let series = &mut ctx.accounts.series;
    let action = &mut ctx.accounts.action;
    if kind == ActionKind::Interest {
        series.period_start = action.period_end;
        series.next_coupon_date = next_coupon_after(series, action.period_end)?;
        series.open_action = None;
        action.status = ActionStatus::Completed as u8;
    } else if kind == ActionKind::PartialRedemption {
        // Partial call: holders keep every unit, each unit's outstanding face shrinks by the principal just paid
        // (later coupons and the final redemption accrue on the remainder). Accrued interest is paid up to the call
        // date, so the running period restarts there. Nothing is burned.
        series.face_value = series
            .face_value
            .checked_sub(action.per_unit_principal)
            .ok_or(QuponError::MathOverflow)?;
        series.period_start = action.period_end;
        if action.period_end >= series.next_coupon_date {
            series.next_coupon_date = next_coupon_after(series, action.period_end)?;
        }
        series.open_action = None;
        action.status = ActionStatus::Completed as u8;
    } else {
        // Principal paid: the register is resumed only so retire_batch can burn (Pausable blocks burns).
        series.status = SeriesStatus::Retiring as u8;
        action.status = ActionStatus::Retiring as u8;
    }
    action.completed_at = clock.unix_timestamp;

    emit!(ActionCompleted {
        series: series.key(),
        action: action.key(),
        index: action.index,
        kind: action.kind,
        status: action.status,
        holders_paid: action.holders_paid,
        total_paid: action.total_paid,
        next_coupon_date: series.next_coupon_date,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}

/// Coupon k = issue_date + k × (12/frequency) months, computed from issue_date (never by stepping the previous
/// date: end-of-month clamping would drift). Capped at maturity — the final coupon is paid with REDM.
fn next_coupon_after(series: &Series, period_end: i64) -> Result<i64> {
    let months = 12 / u32::from(series.frequency);
    let civil = |ts: i64| -> Result<Ymd> {
        let local = ts
            .checked_add(ALMATY_UTC_OFFSET_SECS)
            .ok_or(QuponError::MathOverflow)?;
        Ymd::from_unix_utc(local).map_err(math_err)
    };
    let (issue, end) = (civil(series.issue_date)?, civil(period_end)?);
    let elapsed =
        (i64::from(end.y) * 12 + i64::from(end.m)) - (i64::from(issue.y) * 12 + i64::from(issue.m));
    let k = u32::try_from(elapsed / i64::from(months) + 1)
        .map_err(|_| error!(QuponError::InvalidDates))?;
    let total = k.checked_mul(months).ok_or(QuponError::MathOverflow)?;
    let next = add_months_almaty(series.issue_date, total)?;
    Ok(next.min(series.maturity_date))
}

#[derive(Accounts)]
pub struct SweepEscrow<'info> {
    /// Registrar or paying agent (checked in the handler); receives the escrow account's rent.
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(has_one = cash_mint)]
    pub series: Box<Account<'info, Series>>,
    #[account(
        seeds = [ACTION_SEED, series.key().as_ref(), &action.index.to_le_bytes()],
        bump = action.bump,
        has_one = series,
        has_one = escrow
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    pub cash_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Any cash account of the issuer: the surplus goes back to whoever funded the action.
    #[account(
        mut,
        token::mint = cash_mint,
        token::authority = series.issuer,
        token::token_program = cash_token_program
    )]
    pub issuer_cash: Box<InterfaceAccount<'info, TokenAccount>>,
    pub cash_token_program: Interface<'info, TokenInterface>,
}

/// Return what is left in a finished action's escrow (stray transfers, rounding) to the issuer and close it. Only
/// once nobody can be owed from it: Completed, Retiring (complete_action checked every holder was paid) or Cancelled.
pub fn handle_sweep_escrow(ctx: Context<SweepEscrow>) -> Result<()> {
    require_operator(&ctx.accounts.series, &ctx.accounts.authority.key())?;
    let status = ctx.accounts.action.status;
    require!(
        status == ActionStatus::Completed as u8
            || status == ActionStatus::Retiring as u8
            || status == ActionStatus::Cancelled as u8,
        QuponError::WrongStatus
    );

    let series_key = ctx.accounts.series.key();
    let index_le = ctx.accounts.action.index.to_le_bytes();
    let bump = [ctx.accounts.action.bump];
    let seeds: &[&[u8]] = &[ACTION_SEED, series_key.as_ref(), &index_le, &bump];
    let amount = ctx.accounts.escrow.amount;
    let program = ctx.accounts.cash_token_program.key();
    if amount > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                program,
                TransferChecked {
                    from: ctx.accounts.escrow.to_account_info(),
                    mint: ctx.accounts.cash_mint.to_account_info(),
                    to: ctx.accounts.issuer_cash.to_account_info(),
                    authority: ctx.accounts.action.to_account_info(),
                },
                &[seeds],
            ),
            amount,
            ctx.accounts.cash_mint.decimals,
        )?;
    }
    close_account(CpiContext::new_with_signer(
        program,
        CloseAccount {
            account: ctx.accounts.escrow.to_account_info(),
            destination: ctx.accounts.authority.to_account_info(),
            authority: ctx.accounts.action.to_account_info(),
        },
        &[seeds],
    ))?;

    let clock = Clock::get()?;
    emit!(EscrowSwept {
        series: series_key,
        action: ctx.accounts.action.key(),
        index: ctx.accounts.action.index,
        amount,
        to: ctx.accounts.issuer_cash.key(),
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}
