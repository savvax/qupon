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
                metadata_pointer::instruction::initialize(
                    &tp,
                    &m,
                    Some(opts.pointer_authority.unwrap_or(registrar)),
                    Some(m),
                )
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
    pub pointer_authority: Option<Pubkey>,
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

/// An initialized series: bond mint + series PDA + cash mint (issuer is the cash mint authority).
#[derive(Clone, Copy)]
pub struct Bond {
    pub mint: Pubkey,
    pub series: Pubkey,
    pub cash: Pubkey,
    pub cash_tp: Pubkey,
}

pub fn ata(owner: &Pubkey, mint: &Pubkey, tp: &Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(owner, mint, tp)
}

pub fn investor_pda(series: &Pubkey, owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[
            qupon_bonds::constants::INVESTOR_SEED,
            series.as_ref(),
            owner.as_ref(),
        ],
        &qupon_bonds::id(),
    )
    .0
}

pub fn kyc() -> qupon_bonds::KycParams {
    qupon_bonds::KycParams {
        investor_type: 0,
        residency: 0,
        tax_rate_bps: 0,
        kyc_ref: [7; 32],
    }
}

impl Env {
    /// SPL-Token cash mint + bond mint + `init_series` with default params.
    pub fn setup_bond(&mut self) -> Bond {
        let cash = self.create_cash_mint(spl_token::ID);
        let (mint, series) = self.create_bond_mint(BondMintOpts::default());
        let ix = self.init_series_ix(mint, cash, spl_token::ID, self.params());
        self.send(&[ix], &[]).expect("init_series");
        Bond {
            mint,
            series,
            cash,
            cash_tp: spl_token::ID,
        }
    }

    pub fn register_ix(&self, b: &Bond, signer: &Pubkey, owner: &Pubkey) -> Instruction {
        Instruction::new_with_bytes(
            qupon_bonds::id(),
            &qupon_bonds::instruction::RegisterInvestor { kyc: kyc() }.data(),
            qupon_bonds::accounts::RegisterInvestor {
                registrar: *signer,
                series: b.series,
                owner: *owner,
                investor: investor_pda(&b.series, owner),
                mint: b.mint,
                bond_ata: ata(owner, &b.mint, &spl_token_2022::ID),
                cash_mint: b.cash,
                cash_ata: ata(owner, &b.cash, &b.cash_tp),
                bond_token_program: spl_token_2022::ID,
                cash_token_program: b.cash_tp,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::solana_program::system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn register(&mut self, b: &Bond, owner: &Pubkey) -> TransactionResult {
        let ix = self.register_ix(b, &self.registrar.pubkey(), owner);
        self.send(&[ix], &[])
    }

    pub fn set_status_ix(&self, b: &Bond, owner: &Pubkey, suspend: bool) -> Instruction {
        let data = if suspend {
            qupon_bonds::instruction::SuspendInvestor {}.data()
        } else {
            qupon_bonds::instruction::ReinstateInvestor {}.data()
        };
        Instruction::new_with_bytes(
            qupon_bonds::id(),
            &data,
            qupon_bonds::accounts::SetInvestorStatus {
                registrar: self.registrar.pubkey(),
                series: b.series,
                investor: investor_pda(&b.series, owner),
                mint: b.mint,
                bond_ata: ata(owner, &b.mint, &spl_token_2022::ID),
                bond_token_program: spl_token_2022::ID,
            }
            .to_account_metas(None),
        )
    }

    /// Issuer's cash ATA (created idempotently).
    pub fn issuer_cash(&mut self, b: &Bond) -> Pubkey {
        let issuer = self.issuer.pubkey();
        let ix = anchor_spl::associated_token::spl_associated_token_account::instruction::create_associated_token_account_idempotent(
            &self.registrar.pubkey(), &issuer, &b.cash, &b.cash_tp,
        );
        self.send(&[ix], &[]).expect("issuer cash ata");
        ata(&issuer, &b.cash, &b.cash_tp)
    }

    /// Mint `amount` cash to `owner`'s cash ATA (issuer is the cash mint authority in tests).
    pub fn fund_cash(&mut self, b: &Bond, owner: &Pubkey, amount: u64) {
        let ix = spl_token::instruction::mint_to(
            &spl_token::ID,
            &b.cash,
            &ata(owner, &b.cash, &b.cash_tp),
            &self.issuer.pubkey(),
            &[],
            amount,
        )
        .unwrap();
        let issuer = self.issuer.insecure_clone();
        self.send(&[ix], &[&issuer]).expect("fund cash");
    }

    pub fn subscribe_ix(
        &mut self,
        b: &Bond,
        owner: &Pubkey,
        units: u64,
        price: u64,
    ) -> Instruction {
        let issuer_cash = self.issuer_cash(b);
        Instruction::new_with_bytes(
            qupon_bonds::id(),
            &qupon_bonds::instruction::Subscribe {
                units,
                price_per_unit: price,
            }
            .data(),
            qupon_bonds::accounts::Subscribe {
                owner: *owner,
                series: b.series,
                investor: investor_pda(&b.series, owner),
                mint: b.mint,
                bond_ata: ata(owner, &b.mint, &spl_token_2022::ID),
                cash_mint: b.cash,
                cash_ata: ata(owner, &b.cash, &b.cash_tp),
                issuer_cash,
                bond_token_program: spl_token_2022::ID,
                cash_token_program: b.cash_tp,
            }
            .to_account_metas(None),
        )
    }

    pub fn issue_ix(&self, b: &Bond, issuer: &Pubkey, owner: &Pubkey, units: u64) -> Instruction {
        Instruction::new_with_bytes(
            qupon_bonds::id(),
            &qupon_bonds::instruction::IssueUnits { units }.data(),
            qupon_bonds::accounts::IssueUnits {
                issuer: *issuer,
                series: b.series,
                investor: investor_pda(&b.series, owner),
                mint: b.mint,
                bond_ata: ata(owner, &b.mint, &spl_token_2022::ID),
                bond_token_program: spl_token_2022::ID,
            }
            .to_account_metas(None),
        )
    }

    /// Token amount (base layout is identical for SPL Token and Token-2022: amount at 64..72).
    pub fn balance(&self, token_account: &Pubkey) -> u64 {
        let a = self.svm.get_account(token_account).expect("token account");
        u64::from_le_bytes(a.data[64..72].try_into().unwrap())
    }

    /// Account state byte at 108: 1 = Initialized, 2 = Frozen.
    pub fn is_frozen(&self, token_account: &Pubkey) -> bool {
        self.svm
            .get_account(token_account)
            .expect("token account")
            .data[108]
            == 2
    }
}

pub fn action_pda(series: &Pubkey, index: u32) -> Pubkey {
    Pubkey::find_program_address(
        &[
            qupon_bonds::constants::ACTION_SEED,
            series.as_ref(),
            &index.to_le_bytes(),
        ],
        &qupon_bonds::id(),
    )
    .0
}

pub fn corp_id(s: &str) -> [u8; 16] {
    let mut id = [0u8; 16];
    id[..s.len()].copy_from_slice(s.as_bytes());
    id
}

/// INTR #1 of the default series: 2026-07-03 → 2027-01-03, 10%, 180 days (30E/360); record in 60 s.
pub fn intr_args(now: i64) -> qupon_bonds::AnnounceArgs {
    qupon_bonds::AnnounceArgs {
        kind: 0,
        mandatory: 0,
        corp_id: corp_id("QPNb1-INTR-0001"),
        official_id: [0; 16],
        record_at: now + 60,
        payment_at: now + 120,
        period_start_ymd: 20260703,
        period_end_ymd: 20270103,
        period_start_ts: ISSUE_DATE,
        period_end_ts: NEXT_COUPON,
        accrual_days: 180,
        rate_bps: 1000,
        factor_bps: 0,
        proposal_new_rate_bps: 0,
        proposal_new_maturity: 0,
        voting_ends_at: 0,
    }
}

impl Env {
    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    /// `announce_action` for the series' next action index.
    pub fn announce_ix(
        &self,
        b: &Bond,
        authority: &Pubkey,
        args: qupon_bonds::AnnounceArgs,
    ) -> Instruction {
        let s: qupon_bonds::Series = self.account(&b.series);
        let action = action_pda(&b.series, s.action_count);
        Instruction::new_with_bytes(
            qupon_bonds::id(),
            &qupon_bonds::instruction::AnnounceAction { args }.data(),
            qupon_bonds::accounts::AnnounceAction {
                authority: *authority,
                series: b.series,
                action,
                cash_mint: b.cash,
                escrow: ata(&action, &b.cash, &b.cash_tp),
                cash_token_program: b.cash_tp,
                associated_token_program: anchor_spl::associated_token::ID,
                system_program: anchor_lang::solana_program::system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    pub fn cancel_ix(&self, b: &Bond, index: u32) -> Instruction {
        Instruction::new_with_bytes(
            qupon_bonds::id(),
            &qupon_bonds::instruction::CancelAction {}.data(),
            qupon_bonds::accounts::CancelAction {
                registrar: self.registrar.pubkey(),
                series: b.series,
                action: action_pda(&b.series, index),
            }
            .to_account_metas(None),
        )
    }
}

pub fn entitlement_pda(action: &Pubkey, owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[
            qupon_bonds::constants::ENTITLEMENT_SEED,
            action.as_ref(),
            owner.as_ref(),
        ],
        &qupon_bonds::id(),
    )
    .0
}

impl Env {
    fn action_ix(
        &self,
        data: Vec<u8>,
        metas: Vec<anchor_lang::solana_program::instruction::AccountMeta>,
    ) -> Instruction {
        Instruction::new_with_bytes(qupon_bonds::id(), &data, metas)
    }

    pub fn strike_ix(&self, b: &Bond, authority: &Pubkey, index: u32) -> Instruction {
        self.action_ix(
            qupon_bonds::instruction::StrikeRecord {}.data(),
            qupon_bonds::accounts::StrikeRecord {
                authority: *authority,
                series: b.series,
                action: action_pda(&b.series, index),
                mint: b.mint,
                bond_token_program: spl_token_2022::ID,
            }
            .to_account_metas(None),
        )
    }

    /// `snapshot_batch` over `owners` in the given order (the CLI sorts by owner pubkey ascending).
    pub fn snapshot_ix(&self, b: &Bond, index: u32, owners: &[Pubkey]) -> Instruction {
        use anchor_lang::solana_program::instruction::AccountMeta;
        let action = action_pda(&b.series, index);
        let mut metas = qupon_bonds::accounts::SnapshotBatch {
            authority: self.registrar.pubkey(),
            series: b.series,
            action,
            mint: b.mint,
            system_program: anchor_lang::solana_program::system_program::ID,
        }
        .to_account_metas(None);
        for o in owners {
            metas.push(AccountMeta::new_readonly(investor_pda(&b.series, o), false));
            metas.push(AccountMeta::new_readonly(
                ata(o, &b.mint, &spl_token_2022::ID),
                false,
            ));
            metas.push(AccountMeta::new(entitlement_pda(&action, o), false));
        }
        self.action_ix(qupon_bonds::instruction::SnapshotBatch {}.data(), metas)
    }

    pub fn finalize_snapshot_ix(&self, b: &Bond, index: u32) -> Instruction {
        self.action_ix(
            qupon_bonds::instruction::FinalizeSnapshot {}.data(),
            qupon_bonds::accounts::FinalizeSnapshot {
                authority: self.registrar.pubkey(),
                series: b.series,
                action: action_pda(&b.series, index),
                mint: b.mint,
                bond_token_program: spl_token_2022::ID,
            }
            .to_account_metas(None),
        )
    }

    /// Register holders (tax rate per holder) and issue them `units` each. Returns keypairs sorted by pubkey.
    pub fn holders_with_tax(&mut self, b: &Bond, holdings: &[(u64, u16)]) -> Vec<(Keypair, u64)> {
        let issuer = self.issuer.insecure_clone();
        let mut out = vec![];
        for &(u, tax) in holdings {
            let owner = Keypair::new();
            let mut ix = self.register_ix(b, &self.registrar.pubkey(), &owner.pubkey());
            ix.data = qupon_bonds::instruction::RegisterInvestor {
                kyc: qupon_bonds::KycParams {
                    tax_rate_bps: tax,
                    ..kyc()
                },
            }
            .data();
            self.send(&[ix], &[]).expect("register");
            let ix = self.issue_ix(b, &issuer.pubkey(), &owner.pubkey(), u);
            self.send(&[ix], &[&issuer]).expect("issue");
            out.push((owner, u));
        }
        out.sort_by_key(|(k, _)| k.pubkey());
        out
    }

    pub fn holders(&mut self, b: &Bond, units: &[u64]) -> Vec<(Keypair, u64)> {
        let h: Vec<(u64, u16)> = units.iter().map(|&u| (u, 0)).collect();
        self.holders_with_tax(b, &h)
    }

    pub fn fund_ix(&mut self, b: &Bond, funder: &Pubkey, index: u32, amount: u64) -> Instruction {
        let action = action_pda(&b.series, index);
        self.action_ix(
            qupon_bonds::instruction::FundAction { amount }.data(),
            qupon_bonds::accounts::FundAction {
                funder: *funder,
                series: b.series,
                action,
                cash_mint: b.cash,
                funder_cash: ata(funder, &b.cash, &b.cash_tp),
                escrow: ata(&action, &b.cash, &b.cash_tp),
                cash_token_program: b.cash_tp,
            }
            .to_account_metas(None),
        )
    }

    /// `pay_batch` over `owners` (each owner's Entitlement, Investor and cash ATA).
    pub fn pay_ix(&self, b: &Bond, index: u32, owners: &[Pubkey]) -> Instruction {
        use anchor_lang::solana_program::instruction::AccountMeta;
        let action = action_pda(&b.series, index);
        let mut metas = qupon_bonds::accounts::PayBatch {
            authority: self.registrar.pubkey(),
            series: b.series,
            action,
            cash_mint: b.cash,
            escrow: ata(&action, &b.cash, &b.cash_tp),
            tax_vault: ata(&b.series, &b.cash, &b.cash_tp),
            cash_token_program: b.cash_tp,
        }
        .to_account_metas(None);
        for o in owners {
            metas.push(AccountMeta::new(entitlement_pda(&action, o), false));
            metas.push(AccountMeta::new_readonly(investor_pda(&b.series, o), false));
            metas.push(AccountMeta::new(ata(o, &b.cash, &b.cash_tp), false));
        }
        self.action_ix(qupon_bonds::instruction::PayBatch {}.data(), metas)
    }

    pub fn complete_ix(&self, b: &Bond, index: u32) -> Instruction {
        self.action_ix(
            qupon_bonds::instruction::CompleteAction {}.data(),
            qupon_bonds::accounts::CompleteAction {
                authority: self.registrar.pubkey(),
                series: b.series,
                action: action_pda(&b.series, index),
                mint: b.mint,
                bond_token_program: spl_token_2022::ID,
            }
            .to_account_metas(None),
        )
    }

    /// Announce INTR #1, reach the record date, strike, snapshot every holder, finalize.
    pub fn intr_snapshotted(&mut self, b: &Bond, owners: &[Pubkey]) {
        let now = self.now();
        let ix = self.announce_ix(b, &self.registrar.pubkey(), intr_args(now));
        self.send(&[ix], &[]).expect("announce");
        self.set_clock(now + 60);
        let ix = self.strike_ix(b, &self.registrar.pubkey(), 0);
        self.send(&[ix], &[]).expect("strike");
        let ix = self.snapshot_ix(b, 0, owners);
        self.send(&[ix], &[]).expect("snapshot");
        let ix = self.finalize_snapshot_ix(b, 0);
        self.send(&[ix], &[]).expect("finalize");
    }
}

impl Env {
    /// `setup_bond` with modified series params.
    pub fn setup_bond_with(&mut self, f: impl FnOnce(&mut InitSeriesParams)) -> Bond {
        let cash = self.create_cash_mint(spl_token::ID);
        let (mint, series) = self.create_bond_mint(BondMintOpts::default());
        let mut p = self.params();
        f(&mut p);
        let ix = self.init_series_ix(mint, cash, spl_token::ID, p);
        self.send(&[ix], &[]).expect("init_series");
        Bond {
            mint,
            series,
            cash,
            cash_tp: spl_token::ID,
        }
    }

    /// announce(args) → record date → strike → snapshot → finalize → fund exactly → pay → complete (action 0).
    pub fn settle_action(&mut self, b: &Bond, args: qupon_bonds::AnnounceArgs, owners: &[Pubkey]) {
        let now = self.now();
        let ix = self.announce_ix(b, &self.registrar.pubkey(), args);
        self.send(&[ix], &[]).expect("announce");
        self.set_clock(now + 60);
        for ix in [
            self.strike_ix(b, &self.registrar.pubkey(), 0),
            self.snapshot_ix(b, 0, owners),
            self.finalize_snapshot_ix(b, 0),
        ] {
            self.send(&[ix], &[]).expect("record date");
        }
        let a: qupon_bonds::CorporateAction = self.account(&action_pda(&b.series, 0));
        let required = a.total_net + a.total_tax + a.total_principal;
        self.issuer_cash(b);
        let issuer = self.issuer.insecure_clone();
        self.fund_cash(b, &issuer.pubkey(), required);
        let ix = self.fund_ix(b, &issuer.pubkey(), 0, required);
        self.send(&[ix], &[&issuer]).expect("fund");
        let ix = self.pay_ix(b, 0, owners);
        self.send(&[ix], &[]).expect("pay");
        let ix = self.complete_ix(b, 0);
        self.send(&[ix], &[]).expect("complete");
    }

    pub fn retire_ix(&self, b: &Bond, index: u32, owners: &[Pubkey]) -> Instruction {
        use anchor_lang::solana_program::instruction::AccountMeta;
        let action = action_pda(&b.series, index);
        let mut metas = qupon_bonds::accounts::RetireBatch {
            authority: self.registrar.pubkey(),
            series: b.series,
            action,
            mint: b.mint,
            bond_token_program: spl_token_2022::ID,
        }
        .to_account_metas(None);
        for o in owners {
            metas.push(AccountMeta::new(entitlement_pda(&action, o), false));
            metas.push(AccountMeta::new(
                ata(o, &b.mint, &spl_token_2022::ID),
                false,
            ));
        }
        self.action_ix(qupon_bonds::instruction::RetireBatch {}.data(), metas)
    }

    pub fn close_series_ix(&self, b: &Bond, index: u32) -> Instruction {
        self.action_ix(
            qupon_bonds::instruction::CloseSeries {}.data(),
            qupon_bonds::accounts::CloseSeries {
                registrar: self.registrar.pubkey(),
                series: b.series,
                action: action_pda(&b.series, index),
                mint: b.mint,
                bond_token_program: spl_token_2022::ID,
                system_program: anchor_lang::solana_program::system_program::ID,
            }
            .to_account_metas(None),
        )
    }
}

/// BMET: raise the coupon to `new_rate_bps`; voting ends 180 s after `now`.
pub fn bmet_args(now: i64, new_rate_bps: u32) -> qupon_bonds::AnnounceArgs {
    qupon_bonds::AnnounceArgs {
        kind: 4,
        mandatory: 1,
        corp_id: corp_id("QPNb1-BMET-0001"),
        proposal_new_rate_bps: new_rate_bps,
        voting_ends_at: now + 180,
        period_start_ymd: 0,
        period_end_ymd: 0,
        period_start_ts: 0,
        period_end_ts: 0,
        accrual_days: 0,
        rate_bps: 0,
        ..intr_args(now)
    }
}

impl Env {
    pub fn vote_ix(&self, b: &Bond, index: u32, owner: &Pubkey, choice: u8) -> Instruction {
        let action = action_pda(&b.series, index);
        self.action_ix(
            qupon_bonds::instruction::CastVote { choice }.data(),
            qupon_bonds::accounts::CastVote {
                owner: *owner,
                series: b.series,
                action,
                entitlement: entitlement_pda(&action, owner),
            }
            .to_account_metas(None),
        )
    }

    pub fn finalize_meeting_ix(&self, b: &Bond, index: u32) -> Instruction {
        self.action_ix(
            qupon_bonds::instruction::FinalizeMeeting {}.data(),
            qupon_bonds::accounts::FinalizeMeeting {
                registrar: self.registrar.pubkey(),
                series: b.series,
                action: action_pda(&b.series, index),
            }
            .to_account_metas(None),
        )
    }

    pub fn apply_terms_ix(&self, b: &Bond, index: u32) -> Instruction {
        self.action_ix(
            qupon_bonds::instruction::ApplyTermsChange {}.data(),
            qupon_bonds::accounts::ApplyTermsChange {
                registrar: self.registrar.pubkey(),
                series: b.series,
                action: action_pda(&b.series, index),
                mint: b.mint,
                bond_token_program: spl_token_2022::ID,
                system_program: anchor_lang::solana_program::system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    /// Issuer announces BMET (index 0), record date, strike, snapshot, finalize → VotingOpen.
    pub fn open_meeting(&mut self, b: &Bond, owners: &[Pubkey], new_rate_bps: u32) -> i64 {
        let now = self.now();
        let ix = self.announce_ix(b, &self.issuer.pubkey(), bmet_args(now, new_rate_bps));
        let issuer = self.issuer.insecure_clone();
        self.send(&[ix], &[&issuer]).expect("announce BMET");
        self.set_clock(now + 60);
        for ix in [
            self.strike_ix(b, &self.registrar.pubkey(), 0),
            self.snapshot_ix(b, 0, owners),
            self.finalize_snapshot_ix(b, 0),
        ] {
            self.send(&[ix], &[]).expect("record date");
        }
        now + 180
    }
}

impl Env {
    /// Deterministic clock control: move `unix_timestamp` forward by `seconds`.
    pub fn fast_forward(&mut self, seconds: i64) {
        let now = self.now();
        self.set_clock(now + seconds);
    }
}

/// Token-2022 `transfer_checked` of `amount` bond units from `from` (signer) to `to`'s ATA.
pub fn bond_transfer(b: &Bond, from: &Pubkey, to: &Pubkey, amount: u64) -> Instruction {
    spl_token_2022::instruction::transfer_checked(
        &spl_token_2022::ID,
        &ata(from, &b.mint, &spl_token_2022::ID),
        &b.mint,
        &ata(to, &b.mint, &spl_token_2022::ID),
        from,
        &[],
        amount,
        0,
    )
    .unwrap()
}
