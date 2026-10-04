//! LiteSVM helpers shared by the program tests: program loading, tx sending, clock control,
//! client-side Token-2022 bond mint creation (the same sequence `clients/ts` uses — docs/02-architecture.md).
#![allow(dead_code, clippy::result_large_err)] // TransactionResult is LiteSVM's type

use anchor_lang::{
    prelude::{Clock, Pubkey},
    solana_program::program_pack::Pack,
    solana_program::{instruction::Instruction, system_instruction},
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use anchor_spl::{
    associated_token::get_associated_token_address_with_program_id,
    token::spl_token,
    token_2022::spl_token_2022::{
        self,
        extension::{default_account_state, metadata_pointer, pausable, ExtensionType},
        instruction::AuthorityType,
        state::{AccountState, Mint},
    },
    token_2022_extensions::spl_token_metadata_interface,
};
use litesvm::{
    types::{FailedTransactionMetadata, TransactionResult},
    LiteSVM,
};
use qupon_bonds::{error::QuponError, InitSeriesParams};
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;

pub const ISSUE_DATE: i64 = 1_783_018_800; // 2026-07-03 00:00 Asia/Almaty
pub const NEXT_COUPON: i64 = 1_798_916_400; // 2027-01-03 00:00 Asia/Almaty
pub const MATURITY: i64 = 1_846_177_200; // 2028-07-03 00:00 Asia/Almaty

pub struct Env {
    pub svm: LiteSVM,
    pub registrar: Keypair,
    pub issuer: Keypair,
    pub paying_agent: Keypair,
}

impl Env {
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();
        svm.add_program(
            qupon_bonds::id(),
            include_bytes!(concat!(
                env!("CARGO_TARGET_TMPDIR"),
                "/../deploy/qupon_bonds.so"
            )),
        )
        .unwrap();
        // Same Token-2022 build as devnet (Pausable etc.), dumped by `make fixtures`.
        svm.add_program(
            spl_token_2022::ID,
            include_bytes!("../fixtures/spl_token_2022.so"),
        )
        .unwrap();
        let env = Self {
            svm,
            registrar: Keypair::new(),
            issuer: Keypair::new(),
            paying_agent: Keypair::new(),
        };
        let mut env = env;
        for k in [
            env.registrar.pubkey(),
            env.issuer.pubkey(),
            env.paying_agent.pubkey(),
        ] {
            env.svm.airdrop(&k, 100_000_000_000).unwrap();
        }
        env.set_clock(ISSUE_DATE - 86_400);
        env
    }

    pub fn set_clock(&mut self, unix_timestamp: i64) {
        let mut c: Clock = self.svm.get_sysvar();
        c.unix_timestamp = unix_timestamp;
        self.svm.set_sysvar(&c);
    }

    /// Send `ixs` with the registrar as fee payer plus `extra` signers.
    pub fn send(&mut self, ixs: &[Instruction], extra: &[&Keypair]) -> TransactionResult {
        self.svm.expire_blockhash();
        let payer = self.registrar.insecure_clone();
        let mut signers: Vec<&Keypair> = vec![&payer];
        signers.extend_from_slice(extra);
        let msg =
            Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &self.svm.latest_blockhash());
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
        self.svm.send_transaction(tx)
    }

    pub fn account<T: AccountDeserialize>(&self, key: &Pubkey) -> T {
        let acc = self.svm.get_account(key).expect("account exists");
        T::try_deserialize(&mut acc.data.as_slice()).unwrap()
    }

    /// Plain SPL Token cash mint (USDC-like, 6 decimals).
    /// Cash mint without extensions under `tp` (SPL Token = USDC-like, Token-2022 = tKZT-like).
    pub fn create_cash_mint(&mut self, tp: Pubkey) -> Pubkey {
        let mint = Keypair::new();
        let len = spl_token::state::Mint::LEN;
        let rent = self.svm.minimum_balance_for_rent_exemption(len);
        let init = if tp == spl_token::ID {
            spl_token::instruction::initialize_mint2(
                &tp,
                &mint.pubkey(),
                &self.issuer.pubkey(),
                None,
                6,
            )
        } else {
            spl_token_2022::instruction::initialize_mint2(
                &tp,
                &mint.pubkey(),
                &self.issuer.pubkey(),
                None,
                2,
            )
        };
        let ixs = [
            system_instruction::create_account(
                &self.registrar.pubkey(),
                &mint.pubkey(),
                rent,
                len as u64,
                &tp,
            ),
            init.unwrap(),
        ];
        self.send(&ixs, &[&mint]).expect("cash mint");
        mint.pubkey()
    }

    /// Bond mint built with the documented sequence (docs/02-architecture.md); `opts` breaks one property.
    pub fn create_bond_mint(&mut self, opts: BondMintOpts) -> (Pubkey, Pubkey) {
        let mint = Keypair::new();
        let m = mint.pubkey();
        let series = series_pda(&m);
        let registrar = self.registrar.pubkey();
        let tp = spl_token_2022::ID;
        let with = |e: ExtensionType| opts.omit != Some(e);

        let mut exts = vec![];
        let mut ixs = vec![];
        if with(ExtensionType::MetadataPointer) {
            exts.push(ExtensionType::MetadataPointer);
            ixs.push(
                metadata_pointer::instruction::initialize(&tp, &m, Some(registrar), Some(m))
                    .unwrap(),
            );
        }
        if with(ExtensionType::PermanentDelegate) {
            exts.push(ExtensionType::PermanentDelegate);
            let delegate = opts.permanent_delegate.unwrap_or(series);
            ixs.push(
                spl_token_2022::instruction::initialize_permanent_delegate(&tp, &m, &delegate)
                    .unwrap(),
            );
        }
        if with(ExtensionType::Pausable) {
            exts.push(ExtensionType::Pausable);
            let authority = opts.pausable_authority.unwrap_or(series);
            ixs.push(pausable::instruction::initialize(&tp, &m, &authority).unwrap());
        }
        if with(ExtensionType::MintCloseAuthority) {
            exts.push(ExtensionType::MintCloseAuthority);
            ixs.push(
                spl_token_2022::instruction::initialize_mint_close_authority(
                    &tp,
                    &m,
                    Some(&series),
                )
                .unwrap(),
            );
        }
        if with(ExtensionType::DefaultAccountState) {
            exts.push(ExtensionType::DefaultAccountState);
            ixs.push(
                default_account_state::instruction::initialize_default_account_state(
                    &tp,
                    &m,
                    &AccountState::Frozen,
                )
                .unwrap(),
            );
        }
        if opts.non_transferable {
            exts.push(ExtensionType::NonTransferable);
            ixs.push(
                spl_token_2022::instruction::initialize_non_transferable_mint(&tp, &m).unwrap(),
            );
        }
        let space = ExtensionType::try_calculate_account_len::<Mint>(&exts).unwrap();
        // Extra lamports for the TokenMetadata realloc.
        let lamports = self.svm.minimum_balance_for_rent_exemption(space + 512);
        ixs.insert(
            0,
            system_instruction::create_account(&registrar, &m, lamports, space as u64, &tp),
        );

        // Temporary mint authority = registrar so it can sign InitializeTokenMetadata; then hand it to the PDA.
        ixs.push(
            spl_token_2022::instruction::initialize_mint2(
                &tp,
                &m,
                &registrar,
                Some(&series),
                opts.decimals,
            )
            .unwrap(),
        );
        if with(ExtensionType::MetadataPointer) {
            ixs.push(spl_token_metadata_interface::instruction::initialize(
                &tp,
                &m,
                &opts.metadata_update_authority.unwrap_or(registrar),
                &m,
                &registrar,
                "Qupon Bond QPNb1".into(),
                "QPNb1".into(),
                "https://qupon.example/QPNb1.json".into(),
            ));
        }
        if !opts.keep_registrar_mint_authority {
            ixs.push(
                spl_token_2022::instruction::set_authority(
                    &tp,
                    &m,
                    Some(&series),
                    AuthorityType::MintTokens,
                    &registrar,
                    &[],
                )
                .unwrap(),
            );
        }
        self.send(&ixs, &[&mint]).expect("bond mint");
        (m, series)
    }

    pub fn init_series_ix(
        &self,
        mint: Pubkey,
        cash_mint: Pubkey,
        cash_tp: Pubkey,
        params: InitSeriesParams,
    ) -> Instruction {
        let series = series_pda(&mint);
        Instruction::new_with_bytes(
            qupon_bonds::id(),
            &qupon_bonds::instruction::InitSeries { params }.data(),
            qupon_bonds::accounts::InitSeries {
                registrar: self.registrar.pubkey(),
                mint,
                cash_mint,
                series,
                tax_vault: get_associated_token_address_with_program_id(
                    &series, &cash_mint, &cash_tp,
                ),
                bond_token_program: spl_token_2022::ID,
                cash_token_program: cash_tp,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::solana_program::system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn params(&self) -> InitSeriesParams {
        let mut isin = [0u8; 12];
        isin.copy_from_slice(b"KZ2C0QUPON01");
        let mut ticker = [0u8; 16];
        ticker[..5].copy_from_slice(b"QPNb1");
        InitSeriesParams {
            issuer: self.issuer.pubkey(),
            paying_agent: self.paying_agent.pubkey(),
            isin,
            ticker,
            face_value: 100_000,
            coupon_rate_bps: 1000,
            frequency: 2,
            day_count: 0,
            issue_date: ISSUE_DATE,
            maturity_date: MATURITY,
            quorum_bps: 5000,
            approval_bps: 6667,
        }
    }
}

#[derive(Default)]
pub struct BondMintOpts {
    pub omit: Option<ExtensionType>,
    pub permanent_delegate: Option<Pubkey>,
    pub pausable_authority: Option<Pubkey>,
    pub metadata_update_authority: Option<Pubkey>,
    pub decimals: u8,
    pub non_transferable: bool,
    pub keep_registrar_mint_authority: bool,
}

pub fn series_pda(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[qupon_bonds::constants::SERIES_SEED, mint.as_ref()],
        &qupon_bonds::id(),
    )
    .0
}

/// Assert the transaction failed with the given program error.
pub fn assert_err(res: TransactionResult, expected: QuponError) {
    let FailedTransactionMetadata { err, meta } = res.expect_err("transaction should fail");
    let code = u32::from(expected);
    let want = format!("Custom({code})");
    assert!(
        format!("{err:?}").contains(&want),
        "expected {expected:?} ({code}), got {err:?}\nlogs: {:#?}",
        meta.logs
    );
}
