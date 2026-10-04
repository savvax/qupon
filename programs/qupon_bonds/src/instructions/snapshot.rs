//! Record-date mechanism (03-domain §4): pause the bond mint, snapshot every holder on-chain, check supply.
use anchor_lang::{prelude::*, Discriminator};
use anchor_spl::{
    token_2022::Token2022,
    token_2022_extensions::{pausable_pause, PausableToggle},
    token_interface::{Mint, TokenAccount},
};
use entitlement::{DayCount, Kind};

use crate::{
    constants::*,
    error::{math_err, QuponError},
    events::{HolderSnapshotted, RecordStruck, SnapshotFinalized},
    state::{
        ActionKind, ActionStatus, CorporateAction, Entitlement, EntitlementStatus, Investor,
        Series, VoteChoice,
    },
    utils::{create_pda_account, mint_paused, require_operator},
};

/// Max `[Investor, bond ATA, Entitlement]` triples per `snapshot_batch` (docs/02 batch sizing).
pub const SNAPSHOT_BATCH_MAX: usize = 8;

#[derive(Accounts)]
pub struct StrikeRecord<'info> {
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

pub fn handle_strike_record(ctx: Context<StrikeRecord>) -> Result<()> {
    require_operator(&ctx.accounts.series, &ctx.accounts.authority.key())?;
    let action = &ctx.accounts.action;
    require!(
        action.status == ActionStatus::Announced as u8,
        QuponError::WrongStatus
    );
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= action.record_at,
        QuponError::TooEarly
    );

    // Freeze the register: no transfers, mints or burns until complete_action resumes the mint.
    let mint = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[SERIES_SEED, mint.as_ref(), &[ctx.accounts.series.bump]];
    pausable_pause(CpiContext::new_with_signer(
        ctx.accounts.bond_token_program.key(),
        PausableToggle {
            token_program_id: ctx.accounts.bond_token_program.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.series.to_account_info(),
        },
        &[seeds],
    ))?;

    let action = &mut ctx.accounts.action;
    action.status = ActionStatus::RecordStruck as u8;
    action.snapshot_slot = clock.slot;
    emit!(RecordStruck {
        series: action.series,
        action: action.key(),
        index: action.index,
        record_at: action.record_at,
        snapshot_slot: clock.slot,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SnapshotBatch<'info> {
    /// Registrar or paying agent; pays rent for new Entitlement accounts.
    #[account(mut)]
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
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub system_program: Program<'info, System>,
}

/// `remaining_accounts` = N × [Investor PDA, bond ATA, Entitlement PDA (writable)]. Idempotent: holders already
/// snapshotted and zero balances are skipped, so a re-sent batch is a no-op.
pub fn handle_snapshot_batch<'info>(ctx: Context<'info, SnapshotBatch<'info>>) -> Result<()> {
    let series = &ctx.accounts.series;
    require_operator(series, &ctx.accounts.authority.key())?;
    require!(
        ctx.accounts.action.status == ActionStatus::RecordStruck as u8,
        QuponError::WrongStatus
    );
    require!(
        mint_paused(&ctx.accounts.mint.to_account_info())?,
        QuponError::MintNotPaused
    );
    let rem = ctx.remaining_accounts;
    require!(rem.len().is_multiple_of(3), QuponError::InvalidParams);
    require!(
        rem.len() / 3 <= SNAPSHOT_BATCH_MAX,
        QuponError::BatchTooLarge
    );

    let action_key = ctx.accounts.action.key();
    let kind = action_kind(&ctx.accounts.action)?;
    let dc = DayCount::try_from(series.day_count).map_err(math_err)?;
    let clock = Clock::get()?;

    for t in rem.chunks(3) {
        let investor: Account<Investor> = Account::try_from(&t[0])?;
        require_keys_eq!(
            investor.series,
            series.key(),
            QuponError::AccountOwnerMismatch
        );
        require_keys_eq!(
            t[1].key(),
            investor.bond_ata,
            QuponError::AccountOwnerMismatch
        );
        let ata: InterfaceAccount<TokenAccount> = InterfaceAccount::try_from(&t[1])?;
        require_keys_eq!(ata.mint, series.mint, QuponError::AccountMintMismatch);
        require_keys_eq!(ata.owner, investor.owner, QuponError::AccountOwnerMismatch);

        let owner = investor.owner;
        let (pda, bump) = Pubkey::find_program_address(
            &[ENTITLEMENT_SEED, action_key.as_ref(), owner.as_ref()],
            &crate::ID,
        );
        require_keys_eq!(t[2].key(), pda, QuponError::InvalidParams);
        if ata.amount == 0 || !t[2].data_is_empty() {
            continue; // nothing held, or already snapshotted (AlreadyProcessed is not an error inside a batch)
        }

        let action = &ctx.accounts.action;
        let e = entitlement::entitlement(
            ata.amount,
            series.face_value,
            action.rate_bps,
            dc,
            action.accrual_days,
            investor.tax_rate_bps,
            kind,
        )
        .map_err(math_err)?;

        let space = Entitlement::DISCRIMINATOR.len() + Entitlement::INIT_SPACE;
        create_pda_account(
            &ctx.accounts.authority.to_account_info(),
            &t[2],
            &ctx.accounts.system_program.to_account_info(),
            space,
            &[
                ENTITLEMENT_SEED,
                action_key.as_ref(),
                owner.as_ref(),
                &[bump],
            ],
        )?;
        let record = Entitlement {
            bump,
            action: action_key,
            owner,
            units: ata.amount,
            gross: e.gross,
            tax: e.tax,
            net: e.net,
            principal: e.principal,
            status: EntitlementStatus::Snapshotted as u8,
            paid_at: 0,
            vote: VoteChoice::None as u8,
            voted_at: 0,
        };
        record.try_serialize(&mut &mut t[2].try_borrow_mut_data()?[..])?;

        let action = &mut ctx.accounts.action;
        let add = |a: u64, b: u64| a.checked_add(b).ok_or(error!(QuponError::MathOverflow));
        action.units_snapshotted = add(action.units_snapshotted, ata.amount)?;
        action.total_gross = add(action.total_gross, e.gross)?;
        action.total_tax = add(action.total_tax, e.tax)?;
        action.total_net = add(action.total_net, e.net)?;
        action.holders_snapshotted = action
            .holders_snapshotted
            .checked_add(1)
            .ok_or(QuponError::MathOverflow)?;
        action.snapshot_hash = snapshot_hash_step(&action.snapshot_hash, &owner, ata.amount);

        emit!(HolderSnapshotted {
            series: action.series,
            action: action_key,
            index: action.index,
            owner,
            bond_ata: ata.key(),
            units: ata.amount,
            gross: e.gross,
            tax: e.tax,
            net: e.net,
            principal: e.principal,
            slot: clock.slot,
            timestamp: clock.unix_timestamp,
        });
    }
    Ok(())
}

/// `sha256(prev ‖ owner ‖ units_le)` — the off-chain reconciler recomputes it over investors sorted by owner.
pub fn snapshot_hash_step(prev: &[u8; 32], owner: &Pubkey, units: u64) -> [u8; 32] {
    solana_sha256_hasher::hashv(&[prev, owner.as_ref(), &units.to_le_bytes()]).to_bytes()
}

fn action_kind(action: &CorporateAction) -> Result<Kind> {
    ActionKind::try_from(action.kind)?;
    Kind::from_code(action.kind, action.factor_bps).map_err(math_err)
}

#[derive(Accounts)]
pub struct FinalizeSnapshot<'info> {
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
    pub mint: Box<InterfaceAccount<'info, Mint>>,
}

pub fn handle_finalize_snapshot(ctx: Context<FinalizeSnapshot>) -> Result<()> {
    let series = &ctx.accounts.series;
    require_operator(series, &ctx.accounts.authority.key())?;
    let action = &ctx.accounts.action;
    require!(
        action.status == ActionStatus::RecordStruck as u8,
        QuponError::WrongStatus
    );
    require!(
        mint_paused(&ctx.accounts.mint.to_account_info())?,
        QuponError::MintNotPaused
    );
    // Transfers are paused, so every unit is in some registered holder's ATA: nobody can be missed.
    require!(
        action.units_snapshotted == ctx.accounts.mint.supply,
        QuponError::SupplyMismatch
    );
    let meeting = action.kind == ActionKind::Meeting as u8;
    if !meeting {
        let dc = DayCount::try_from(series.day_count).map_err(math_err)?;
        let ok = entitlement::rounding_within_tolerance(
            action.total_gross,
            action.units_snapshotted,
            action.holders_snapshotted,
            series.face_value,
            action.rate_bps,
            dc,
            action.accrual_days,
        )
        .map_err(math_err)?;
        require!(ok, QuponError::RoundingDrift);
    }

    let action = &mut ctx.accounts.action;
    action.status = if meeting {
        ActionStatus::VotingOpen
    } else {
        ActionStatus::SnapshotComplete
    } as u8;
    let clock = Clock::get()?;
    emit!(SnapshotFinalized {
        series: action.series,
        action: action.key(),
        index: action.index,
        units_snapshotted: action.units_snapshotted,
        holders_snapshotted: action.holders_snapshotted,
        total_gross: action.total_gross,
        total_tax: action.total_tax,
        total_net: action.total_net,
        snapshot_hash: action.snapshot_hash,
        status: action.status,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}
