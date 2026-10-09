//! Record date by transfer-hook gate (plan 15 D1'): the bond mint's transfer hook is this program. After a pending
//! record's `record_at`, an owner's bonds move only once their position is snapshotted for that record, so every
//! snapshot equals the balance at `record_at` exactly — without pausing the mint and without relying on a crank to be
//! on time. Snapshot-then-transfer in one transaction makes the gate invisible to a trader.
use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    extension::{
        transfer_hook::{TransferHook, TransferHookAccount},
        BaseStateWithExtensions, StateWithExtensions,
    },
    state::{Account as TokenAccountState, Mint as MintState},
};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::{
    constants::*,
    error::QuponError,
    state::{ActionKind, Checkpoint, Series},
    utils::create_pda_account,
};

/// Extra accounts Token-2022 passes to `execute` (indices 5..): series, source owner's and destination owner's
/// checkpoint. Owners come from bytes 32..64 of the token accounts (indices 0 and 2).
fn extra_metas() -> Result<[ExtraAccountMeta; 3]> {
    let ckpt = |token_account_index: u8| {
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: CHECKPOINT_SEED.to_vec(),
                },
                Seed::AccountKey { index: 5 },
                Seed::AccountData {
                    account_index: token_account_index,
                    data_index: 32,
                    length: 32,
                },
            ],
            false,
            false,
        )
    };
    let series = ExtraAccountMeta::new_with_seeds(
        &[
            Seed::Literal {
                bytes: SERIES_SEED.to_vec(),
            },
            Seed::AccountKey { index: 1 },
        ],
        false,
        false,
    );
    match (series, ckpt(0), ckpt(2)) {
        (Ok(s), Ok(a), Ok(b)) => Ok([s, a, b]),
        _ => err!(QuponError::InvalidParams),
    }
}

#[derive(Accounts)]
pub struct InitHook<'info> {
    #[account(mut)]
    pub registrar: Signer<'info>,
    #[account(mut, has_one = registrar @ QuponError::Unauthorized, has_one = mint)]
    pub series: Box<Account<'info, Series>>,
    /// CHECK: the series mint (`has_one`); its TransferHook extension is checked in the handler.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: created here at the standard validation PDA of `mint`.
    #[account(mut, seeds = [EXTRA_METAS_SEED, mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Write the hook's validation account and switch the series to the hook gate (registrar, once).
pub fn handle_init_hook(ctx: Context<InitHook>) -> Result<()> {
    {
        let data = ctx.accounts.mint.try_borrow_data()?;
        let mint = StateWithExtensions::<MintState>::unpack(&data)
            .map_err(|_| error!(QuponError::InvalidMintExtensions))?;
        let hook = mint
            .get_extension::<TransferHook>()
            .map_err(|_| error!(QuponError::InvalidMintExtensions))?;
        require!(
            Option::<Pubkey>::from(hook.program_id) == Some(crate::ID),
            QuponError::InvalidMintExtensions
        );
    }
    require!(ctx.accounts.series.hook == 0, QuponError::AlreadyProcessed);

    let metas = extra_metas()?;
    let space = ExtraAccountMetaList::size_of(metas.len())
        .map_err(|_| error!(QuponError::InvalidParams))?;
    let mint = ctx.accounts.mint.key();
    create_pda_account(
        &ctx.accounts.registrar.to_account_info(),
        &ctx.accounts.extra_account_meta_list.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        space,
        &[
            EXTRA_METAS_SEED,
            mint.as_ref(),
            &[ctx.bumps.extra_account_meta_list],
        ],
    )?;
    let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &metas)
        .map_err(|_| error!(QuponError::InvalidParams))?;
    ctx.accounts.series.hook = 1;
    Ok(())
}

#[derive(Accounts)]
#[instruction(owner: Pubkey)]
pub struct InitCheckpoint<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub series: Box<Account<'info, Series>>,
    #[account(
        init,
        payer = payer,
        space = 8 + Checkpoint::INIT_SPACE,
        seeds = [CHECKPOINT_SEED, series.key().as_ref(), owner.as_ref()],
        bump
    )]
    pub checkpoint: Box<Account<'info, Checkpoint>>,
    pub system_program: Program<'info, System>,
}

/// Create an owner's checkpoint (anyone pays; registration and trade admission create them in the product flow).
pub fn handle_init_checkpoint(ctx: Context<InitCheckpoint>, owner: Pubkey) -> Result<()> {
    let c = &mut ctx.accounts.checkpoint;
    c.bump = ctx.bumps.checkpoint;
    c.series = ctx.accounts.series.key();
    c.owner = owner;
    c.last_seq = 0;
    Ok(())
}

#[derive(Accounts)]
pub struct Execute<'info> {
    /// CHECK: Token-2022 account; its `transferring` flag is checked in the handler.
    #[account(owner = anchor_spl::token_2022::ID)]
    pub source: UncheckedAccount<'info>,
    /// CHECK: the bond mint (the series below is seeded by it).
    pub mint: UncheckedAccount<'info>,
    /// CHECK: Token-2022 account.
    #[account(owner = anchor_spl::token_2022::ID)]
    pub destination: UncheckedAccount<'info>,
    /// CHECK: transfer authority; the gate does not depend on who signs.
    pub authority: UncheckedAccount<'info>,
    /// CHECK: this mint's validation account.
    #[account(seeds = [EXTRA_METAS_SEED, mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    #[account(seeds = [SERIES_SEED, mint.key().as_ref()], bump = series.bump, has_one = mint)]
    pub series: Box<Account<'info, Series>>,
    /// CHECK: checkpoint PDA of the source owner (may not exist) — re-derived in the handler.
    pub source_checkpoint: UncheckedAccount<'info>,
    /// CHECK: checkpoint PDA of the destination owner (may not exist) — re-derived in the handler.
    pub destination_checkpoint: UncheckedAccount<'info>,
}

pub fn handle_execute(ctx: Context<Execute>, _amount: u64) -> Result<()> {
    // Only inside a Token-2022 transfer: a direct call must never be mistaken for one.
    require!(
        token_account(&ctx.accounts.source, |a| {
            a.get_extension::<TransferHookAccount>()
                .is_ok_and(|e| bool::from(e.transferring))
        })?,
        QuponError::NotTransferring
    );
    let s = &ctx.accounts.series;
    if s.record_at == 0 || Clock::get()?.unix_timestamp < s.record_at {
        return Ok(());
    }
    let kind = ActionKind::try_from(s.record_kind)?;
    require!(
        !matches!(kind, ActionKind::Redemption | ActionKind::EarlyRedemption),
        QuponError::RecordLocked
    );
    let series = s.key();
    for (token, ckpt) in [
        (&ctx.accounts.source, &ctx.accounts.source_checkpoint),
        (
            &ctx.accounts.destination,
            &ctx.accounts.destination_checkpoint,
        ),
    ] {
        let owner = token_account(token, |a| a.base.owner)?;
        require!(
            snapshotted(ckpt, &series, &owner, s.record_seq)?,
            QuponError::HolderNotSnapshotted
        );
    }
    Ok(())
}

fn token_account<T>(
    info: &AccountInfo,
    f: impl FnOnce(&StateWithExtensions<TokenAccountState>) -> T,
) -> Result<T> {
    let data = info.try_borrow_data()?;
    let state = StateWithExtensions::<TokenAccountState>::unpack(&data)
        .map_err(|_| error!(QuponError::AccountOwnerMismatch))?;
    Ok(f(&state))
}

/// `true` if `info` is the owner's checkpoint PDA and it already covers record `seq`.
fn snapshotted(info: &AccountInfo, series: &Pubkey, owner: &Pubkey, seq: u32) -> Result<bool> {
    let (pda, _) = Pubkey::find_program_address(
        &[CHECKPOINT_SEED, series.as_ref(), owner.as_ref()],
        &crate::ID,
    );
    require_keys_eq!(info.key(), pda, QuponError::InvalidParams);
    if info.owner != &crate::ID || info.data_is_empty() {
        return Ok(false);
    }
    let c = Checkpoint::try_deserialize(&mut &info.try_borrow_data()?[..])?;
    Ok(c.last_seq >= seq)
}

#[derive(Accounts)]
pub struct MarkSnapshotted<'info> {
    pub series: Box<Account<'info, Series>>,
    #[account(mut, has_one = series)]
    pub checkpoint: Box<Account<'info, Checkpoint>>,
}

/// SPIKE 1509 stand-in for `snapshot_batch` on a hooked series: after `record_at`, mark the owner's position as
/// snapshotted for the pending record (anyone). Task 1510 folds this into `snapshot_batch` with the entitlement.
pub fn handle_mark_snapshotted(ctx: Context<MarkSnapshotted>) -> Result<()> {
    let s = &ctx.accounts.series;
    require!(
        s.record_at != 0 && Clock::get()?.unix_timestamp >= s.record_at,
        QuponError::TooEarly
    );
    ctx.accounts.checkpoint.last_seq = s.record_seq;
    Ok(())
}
