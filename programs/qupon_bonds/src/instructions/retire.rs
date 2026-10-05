//! Redemption tail (03-domain §4): after `complete_action` resumed the mint, burn every holder's units through the
//! permanent delegate, then close the mint and mark the series REDEEMED.
use anchor_lang::{prelude::*, system_program};
use anchor_spl::{
    token_2022::{
        burn_checked, close_account, thaw_account, BurnChecked, CloseAccount, ThawAccount,
        Token2022,
    },
    token_2022_extensions::{
        spl_token_metadata_interface::state::Field, token_metadata_update_field,
        TokenMetadataUpdateField,
    },
    token_interface::{Mint, TokenAccount},
};

use crate::{
    constants::*,
    error::QuponError,
    events::{SeriesClosed, UnitsRetired},
    state::{ActionStatus, CorporateAction, Entitlement, EntitlementStatus, Series, SeriesStatus},
    utils::require_operator,
};

/// Max `[Entitlement, bond ATA]` pairs per `retire_batch` (docs/02 batch sizing).
pub const RETIRE_BATCH_MAX: usize = 12;

#[derive(Accounts)]
pub struct RetireBatch<'info> {
    pub authority: Signer<'info>,
    #[account(has_one = mint)]
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

/// `remaining_accounts` = N × [Entitlement (writable), holder bond ATA (writable)]. Burns whatever the ATA holds
/// (movements after the record date are economically void). Idempotent: Retired entitlements are skipped.
pub fn handle_retire_batch<'info>(ctx: Context<'info, RetireBatch<'info>>) -> Result<()> {
    let series = &ctx.accounts.series;
    require_operator(series, &ctx.accounts.authority.key())?;
    require!(
        ctx.accounts.action.status == ActionStatus::Retiring as u8,
        QuponError::WrongStatus
    );
    let rem = ctx.remaining_accounts;
    require!(rem.len().is_multiple_of(2), QuponError::InvalidParams);
    require!(rem.len() / 2 <= RETIRE_BATCH_MAX, QuponError::BatchTooLarge);

    let action_key = ctx.accounts.action.key();
    let mint_key = ctx.accounts.mint.key();
    let bump = [series.bump];
    let seeds: &[&[u8]] = &[SERIES_SEED, mint_key.as_ref(), &bump];
    let program = ctx.accounts.bond_token_program.key();
    let clock = Clock::get()?;

    for p in rem.chunks(2) {
        let mut ent: Account<Entitlement> = Account::try_from(&p[0])?;
        require_keys_eq!(ent.action, action_key, QuponError::InvalidParams);
        let ata: InterfaceAccount<TokenAccount> = InterfaceAccount::try_from(&p[1])?;
        require_keys_eq!(ata.mint, mint_key, QuponError::AccountMintMismatch);
        require_keys_eq!(ata.owner, ent.owner, QuponError::AccountOwnerMismatch);
        if ent.status == EntitlementStatus::Retired as u8 {
            continue;
        }

        // A suspended holder's ATA is frozen; the permanent delegate cannot burn from a frozen account.
        if ata.is_frozen() {
            thaw_account(CpiContext::new_with_signer(
                program,
                ThawAccount {
                    account: p[1].clone(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.series.to_account_info(),
                },
                &[seeds],
            ))?;
        }
        let burned = ata.amount;
        if burned > 0 {
            burn_checked(
                CpiContext::new_with_signer(
                    program,
                    BurnChecked {
                        mint: ctx.accounts.mint.to_account_info(),
                        from: p[1].clone(),
                        authority: ctx.accounts.series.to_account_info(),
                    },
                    &[seeds],
                ),
                burned,
                0,
            )?;
        }
        ent.status = EntitlementStatus::Retired as u8;
        ent.exit(&crate::ID)?;

        let action = &mut ctx.accounts.action;
        action.total_retired = action
            .total_retired
            .checked_add(burned)
            .ok_or(QuponError::MathOverflow)?;
        action.holders_retired = action
            .holders_retired
            .checked_add(1)
            .ok_or(QuponError::MathOverflow)?;
        emit!(UnitsRetired {
            series: action.series,
            action: action_key,
            index: action.index,
            owner: ent.owner,
            units: burned,
            total_retired: action.total_retired,
            slot: clock.slot,
            timestamp: clock.unix_timestamp,
        });
    }
    Ok(())
}

#[derive(Accounts)]
pub struct CloseSeries<'info> {
    /// Registrar: metadata update authority; receives the mint's lamports.
    #[account(mut)]
    pub registrar: Signer<'info>,
    #[account(mut, has_one = registrar @ QuponError::Unauthorized, has_one = mint)]
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
    pub system_program: Program<'info, System>,
}

pub fn handle_close_series(ctx: Context<CloseSeries>) -> Result<()> {
    let action = &ctx.accounts.action;
    require!(
        action.status == ActionStatus::Retiring as u8,
        QuponError::WrongStatus
    );
    require!(ctx.accounts.mint.supply == 0, QuponError::SupplyNotZero);
    require!(
        action.holders_retired == action.holders_snapshotted,
        QuponError::WrongStatus
    );

    let program = ctx.accounts.bond_token_program.key();
    let mint_info = ctx.accounts.mint.to_account_info();
    let registrar = ctx.accounts.registrar.to_account_info();
    // The metadata write may grow the mint account; top up rent (the close below returns everything).
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            system_program::Transfer {
                from: registrar.clone(),
                to: mint_info.clone(),
            },
        ),
        Rent::get()?.minimum_balance(256),
    )?;
    // A last on-chain record in the token itself before it disappears.
    token_metadata_update_field(
        CpiContext::new(
            program,
            TokenMetadataUpdateField {
                program_id: ctx.accounts.bond_token_program.to_account_info(),
                metadata: mint_info.clone(),
                update_authority: registrar.clone(),
            },
        ),
        Field::Key("status".into()),
        "REDEEMED".into(),
    )?;
    let mint_key = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[SERIES_SEED, mint_key.as_ref(), &[ctx.accounts.series.bump]];
    close_account(CpiContext::new_with_signer(
        program,
        CloseAccount {
            account: mint_info,
            destination: registrar,
            authority: ctx.accounts.series.to_account_info(),
        },
        &[seeds],
    ))?;

    let clock = Clock::get()?;
    let series = &mut ctx.accounts.series;
    series.status = SeriesStatus::Closed as u8;
    series.open_action = None;
    let action = &mut ctx.accounts.action;
    action.status = ActionStatus::Completed as u8;
    action.completed_at = clock.unix_timestamp;
    emit!(SeriesClosed {
        series: series.key(),
        mint: mint_key,
        action: action.key(),
        index: action.index,
        total_retired: action.total_retired,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}
