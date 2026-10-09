//! Compute-unit benchmarks of the batch instructions (docs/02-architecture.md "Batch sizing"): the real program
//! binary in LiteSVM, one measured transaction per row. `reports/cu-benchmarks.md` is regenerated with
//! `QUPON_WRITE_CU_REPORT=1 cargo test -p qupon_bonds --test cu_benchmarks`; a normal run only asserts the limits.
mod common;

use anchor_lang::{
    prelude::{pubkey, Pubkey},
    solana_program::{
        bpf_loader_upgradeable,
        instruction::{AccountMeta, Instruction},
        system_program,
    },
    InstructionData, ToAccountMetas,
};
use anchor_spl::{token::spl_token, token_2022::spl_token_2022};
use common::*;
use qupon_bonds::{
    constants::{DVP_PROGRAM_ID, TRADE_SEED},
    CorporateAction, PAY_BATCH_MAX, RETIRE_BATCH_MAX, SNAPSHOT_BATCH_MAX,
};
use solana_keypair::Keypair;
use solana_signer::Signer;
use std::fmt::Write as _;

/// Transaction-wide compute maximum of the runtime.
const TX_MAX_CU: u64 = 1_400_000;
/// Compute-unit limit the CLI sets on every transaction.
const CLI_CU_LIMIT: u64 = 600_000;
/// Holders per `pay_batch` transaction the CLI sends (docs/02-architecture.md "Batch sizing").
const CLI_PAY_BATCH: usize = 4;
const COMPUTE_BUDGET: Pubkey = pubkey!("ComputeBudget111111111111111111111111111111");
/// (instruction, constant, on-chain maximum, holders per transaction the CLI sends).
const BATCHES: [(&str, &str, usize, usize); 3] = [
    (
        "snapshot_batch",
        "SNAPSHOT_BATCH_MAX",
        SNAPSHOT_BATCH_MAX,
        SNAPSHOT_BATCH_MAX,
    ),
    ("pay_batch", "PAY_BATCH_MAX", PAY_BATCH_MAX, CLI_PAY_BATCH),
    (
        "retire_batch",
        "RETIRE_BATCH_MAX",
        RETIRE_BATCH_MAX,
        RETIRE_BATCH_MAX,
    ),
];
const PAY_WORST: &str = "pay_batch, worst case";
const RETIRE_WORST: &str = "retire_batch, worst case";

/// One measured transaction; `holders` is 0 for a single call.
struct Row {
    name: &'static str,
    holders: usize,
    cu: u64,
}

/// Compute units of a transaction holding `ix` under the 1.4M maximum (SetComputeUnitLimit = tag 2 + u32 LE;
/// without it the transaction would get the 200k default). The CLI's transactions carry the same instruction.
fn cu(ix: Instruction, env: &mut Env, extra: &[&Keypair]) -> u64 {
    let mut data = vec![2u8];
    data.extend((TX_MAX_CU as u32).to_le_bytes());
    let limit = Instruction::new_with_bytes(COMPUTE_BUDGET, &data, vec![]);
    env.send(&[limit, ix], extra)
        .expect("measured transaction")
        .compute_units_consumed
}

struct Flow {
    env: Env,
    b: Bond,
    owners: Vec<Pubkey>,
    strike: u64,
    snapshot: u64,
    finalize: u64,
    fund: u64,
    pay: u64,
    complete: u64,
}

/// A fresh series with `n` holders of 10 units whose action 0 (INTR, or REDM when `redm`) runs from announce to
/// complete with every step measured; `snapshot` and `pay` are the first batch (all holders when they fit one).
/// `worst` takes the expensive payment path: Token-2022 cash (tKZT-like) and 15% withholding tax, i.e. two
/// Token-2022 transfers per holder instead of one SPL Token transfer.
fn flow(n: usize, redm: bool, worst: bool) -> Flow {
    let mut env = Env::new();
    let (cash_tp, tax_bps) = if worst {
        (spl_token_2022::ID, 1500)
    } else {
        (spl_token::ID, 0)
    };
    let cash = env.create_cash_mint(cash_tp);
    let (mint, series) = env.create_bond_mint(BondMintOpts::default());
    let mut params = env.params();
    if redm {
        params.maturity_date = NEXT_COUPON;
    }
    let ix = env.init_series_ix(mint, cash, cash_tp, params);
    env.send(&[ix], &[]).expect("init_series");
    let b = Bond {
        mint,
        series,
        cash,
        cash_tp,
    };
    let holders = env.holders_with_tax(&b, &vec![(10, tax_bps); n]);
    let owners: Vec<Pubkey> = holders.iter().map(|(k, _)| k.pubkey()).collect();
    let registrar = env.registrar.pubkey();

    let now = env.now();
    let mut args = intr_args(now);
    if redm {
        args.kind = 1;
        args.corp_id = corp_id("QPNb1-REDM-0001");
    }
    let ix = env.announce_ix(&b, &registrar, args);
    env.send(&[ix], &[]).expect("announce");
    env.set_clock(now + 60);
    let strike = cu(env.strike_ix(&b, &registrar, 0), &mut env, &[]);
    let snapshot: Vec<u64> = owners
        .chunks(SNAPSHOT_BATCH_MAX)
        .map(|c| cu(env.snapshot_ix(&b, 0, c), &mut env, &[]))
        .collect();
    let finalize = cu(env.finalize_snapshot_ix(&b, 0), &mut env, &[]);

    let a: CorporateAction = env.account(&action_pda(&b.series, 0));
    let required = a.total_net + a.total_tax + a.total_principal;
    let issuer = env.issuer.insecure_clone();
    let issuer_cash = env.issuer_cash(&b);
    // MintTo is encoded identically for both token programs (`Env::fund_cash` is SPL Token only).
    let ix = spl_token_2022::instruction::mint_to(
        &cash_tp,
        &b.cash,
        &issuer_cash,
        &issuer.pubkey(),
        &[],
        required,
    )
    .unwrap();
    env.send(&[ix], &[&issuer]).expect("mint cash");
    let fund = cu(
        env.fund_ix(&b, &issuer.pubkey(), 0, required),
        &mut env,
        &[&issuer],
    );
    let pay: Vec<u64> = owners
        .chunks(PAY_BATCH_MAX)
        .map(|c| cu(env.pay_ix(&b, 0, c), &mut env, &[]))
        .collect();
    let complete = cu(env.complete_ix(&b, 0), &mut env, &[]);
    Flow {
        env,
        b,
        owners,
        strike,
        snapshot: snapshot[0],
        finalize,
        fund,
        pay: pay[0],
        complete,
    }
}

/// `retire_batch` over `n` redeemed holders in one transaction; `worst` suspends them first, so every frozen
/// account costs a thaw before the burn.
fn retire(n: usize, worst: bool) -> u64 {
    let Flow {
        mut env, b, owners, ..
    } = flow(n, true, false);
    if worst {
        for o in &owners {
            let ix = env.set_status_ix(&b, o, true);
            env.send(&[ix], &[]).expect("suspend");
        }
    }
    cu(env.retire_ix(&b, 0, &owners), &mut env, &[])
}

/// `CreateDvp` on the Solana DvP program (10 bonds against cash, the registrar settles) — the instruction
/// tests/trade.rs builds; its helpers are private to that test binary. Returns the SwapDvp record.
fn create_dvp(env: &mut Env, b: &Bond, seller: &Pubkey, buyer: &Pubkey, nonce: u64) -> Pubkey {
    let registrar = env.registrar.pubkey();
    let swap = Pubkey::find_program_address(
        &[
            b"dvp",
            registrar.as_ref(),
            seller.as_ref(),
            buyer.as_ref(),
            b.mint.as_ref(),
            b.cash.as_ref(),
            &nonce.to_le_bytes(),
        ],
        &DVP_PROGRAM_ID,
    )
    .0;
    let tombstone = Pubkey::find_program_address(&[b"nonce", swap.as_ref()], &DVP_PROGRAM_ID).0;
    // Discriminator 0, amount_a, amount_b, expiry, nonce, then four empty options.
    let mut data = vec![0u8];
    data.extend(10u64.to_le_bytes());
    data.extend(1_000_000u64.to_le_bytes());
    data.extend((env.now() + 3600).to_le_bytes());
    data.extend(nonce.to_le_bytes());
    data.extend([0u8; 4]);
    let w = |k: Pubkey| AccountMeta::new(k, false);
    let ro = |k: Pubkey| AccountMeta::new_readonly(k, false);
    let metas = vec![
        AccountMeta::new(registrar, true),
        w(swap),
        w(tombstone),
        ro(registrar),
        ro(*seller),
        ro(*buyer),
        ro(b.mint),
        ro(b.cash),
        w(ata(&swap, &b.mint, &spl_token_2022::ID)),
        w(ata(&swap, &b.cash, &b.cash_tp)),
        ro(system_program::ID),
        ro(spl_token_2022::ID),
        ro(b.cash_tp),
        ro(anchor_spl::associated_token::ID),
    ];
    let ix = Instruction::new_with_bytes(DVP_PROGRAM_ID, &data, metas);
    env.send(&[ix], &[]).expect("CreateDvp");
    swap
}

fn admission_pda(b: &Bond, swap: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[TRADE_SEED, b.series.as_ref(), swap.as_ref()],
        &qupon_bonds::id(),
    )
    .0
}

/// `admit_trade`, a plain `release_trade` (the empty escrow is frozen again) and a forced one that first returns
/// the seller's 10 units from the escrow.
fn trades() -> [u64; 3] {
    let mut env = Env::new();
    env.svm
        .add_program(DVP_PROGRAM_ID, include_bytes!("fixtures/dvp_swap.so"))
        .unwrap();
    let b = env.setup_bond();
    let holders = env.holders(&b, &[10, 10]);
    let (seller, buyer) = (holders[0].0.pubkey(), holders[1].0.pubkey());
    let registrar = env.registrar.pubkey();
    let admit_ix = |swap: Pubkey| {
        Instruction::new_with_bytes(
            qupon_bonds::id(),
            &qupon_bonds::instruction::AdmitTrade {}.data(),
            qupon_bonds::accounts::AdmitTrade {
                authority: registrar,
                series: b.series,
                mint: b.mint,
                swap_dvp: swap,
                escrow: ata(&swap, &b.mint, &spl_token_2022::ID),
                seller: investor_pda(&b.series, &seller),
                buyer: investor_pda(&b.series, &buyer),
                admission: admission_pda(&b, &swap),
                escrow_checkpoint: checkpoint_pda(&b.series, &swap),
                bond_token_program: spl_token_2022::ID,
                system_program: system_program::ID,
                open_action: None,
            }
            .to_account_metas(None),
        )
    };
    let release_ix = |swap: Pubkey, force: bool| {
        Instruction::new_with_bytes(
            qupon_bonds::id(),
            &qupon_bonds::instruction::ReleaseTrade { force }.data(),
            qupon_bonds::accounts::ReleaseTrade {
                authority: registrar,
                series: b.series,
                mint: b.mint,
                admission: admission_pda(&b, &swap),
                escrow: ata(&swap, &b.mint, &spl_token_2022::ID),
                seller: investor_pda(&b.series, &seller),
                seller_bond_ata: ata(&seller, &b.mint, &spl_token_2022::ID),
                escrow_checkpoint: checkpoint_pda(&b.series, &swap),
                bond_token_program: spl_token_2022::ID,
            }
            .to_account_metas(None),
        )
    };

    let swap = create_dvp(&mut env, &b, &seller, &buyer, 1);
    let admit = cu(admit_ix(swap), &mut env, &[]);
    let release = cu(release_ix(swap, false), &mut env, &[]);

    let swap = create_dvp(&mut env, &b, &seller, &buyer, 2);
    env.send(&[admit_ix(swap)], &[]).expect("admit");
    env.send(&[bond_transfer(&b, &seller, &swap, 10)], &[&holders[0].0])
        .expect("seller funds the bond leg");
    let forced = cu(release_ix(swap, true), &mut env, &[]);
    [admit, release, forced]
}

/// Highest measured figure for `ix` (plain or worst case) at `holders`.
fn at(rows: &[Row], ix: &str, holders: usize) -> u64 {
    rows.iter()
        .filter(|r| r.name.starts_with(ix) && r.holders == holders)
        .map(|r| r.cu)
        .max()
        .expect("batch size measured")
}

fn pct(cu: u64, of: u64) -> String {
    format!("{:.1}%", cu as f64 * 100.0 / of as f64)
}

fn report(rows: &[Row], spl_token_build: &str) -> String {
    let date = std::process::Command::new("date")
        .args(["-u", "+%F"])
        .output()
        .expect("date");
    let date = String::from_utf8_lossy(&date.stdout);
    let mut md = format!(
        "# Compute-unit benchmarks — `qupon_bonds`\n\n\
         Generated on {} (UTC) by `QUPON_WRITE_CU_REPORT=1 cargo test -p qupon_bonds --test cu_benchmarks` \
         (`programs/qupon_bonds/tests/cu_benchmarks.rs`). Every number below comes from that run; do not edit by hand.\n\n\
         ## Measurements\n\n\
         | Instruction | Holders | CU | CU per holder | Marginal CU per holder | Share of the 1.4M limit |\n\
         |---|---:|---:|---:|---:|---:|\n",
        date.trim()
    );
    for (i, r) in rows.iter().enumerate() {
        let prev = rows[..i].last().filter(|p| p.name == r.name);
        let dash = || "—".to_string();
        writeln!(
            md,
            "| {} | {} | {} | {} | {} | {} |",
            r.name,
            if r.holders > 0 {
                r.holders.to_string()
            } else {
                dash()
            },
            r.cu,
            r.cu.checked_div(r.holders as u64)
                .map_or_else(dash, |v| v.to_string()),
            prev.map_or_else(dash, |p| {
                ((r.cu as i64 - p.cu as i64) / (r.holders - p.holders) as i64).to_string()
            }),
            pct(r.cu, TX_MAX_CU),
        )
        .unwrap();
    }
    md.push_str(
        "\n*CU per holder* is the whole transaction divided by the holders in it; *marginal* is the increase \
         per added holder against the previous measured size of the same instruction.\n\n\
         ## Batch constants and headroom\n\n\
         | Batch | Constant | CLI sends | Highest CU at the CLI size | Share of the CLI's 600k limit | Highest CU at the on-chain maximum | Share of the 1.4M limit | Holders that fit in 600k CU |\n\
         |---|---|---:|---:|---:|---:|---:|---:|\n",
    );
    for (ix, constant, max, cli) in BATCHES {
        let (one, top, sent) = (at(rows, ix, 1), at(rows, ix, max), at(rows, ix, cli));
        let slope = (top - one) / (max as u64 - 1);
        writeln!(
            md,
            "| `{ix}` | `{constant} = {max}` | {cli} | {sent} | {} | {top} | {} | ~{} |",
            pct(sent, CLI_CU_LIMIT),
            pct(top, TX_MAX_CU),
            1 + (CLI_CU_LIMIT - one) / slope,
        )
        .unwrap();
    }
    write!(
        md,
        "\n\"Highest\" takes the worst-case row where one exists. \"Holders that fit in 600k CU\" extrapolates \
         linearly from the 1-holder and the on-chain-maximum measurements. The test asserts that every measured \
         transaction stays below 1,400,000 CU and that every batch at the size the CLI sends stays below the \
         600,000 CU limit the CLI sets. Where the extrapolated figure is above the constant, compute is not what \
         bounds the batch: the account count and the 1232-byte transaction size are (docs/02-architecture.md, \
         \"Batch sizing\").\n\n\
         ## Method\n\n\
         - LiteSVM (in-process SVM) running the deployed program binary `target/deploy/qupon_bonds.so`, the devnet \
         Token-2022 binary (`tests/fixtures/spl_token_2022.so`) for the bond leg and the devnet DvP binary for the \
         trade instructions. One transaction per row: `SetComputeUnitLimit(1,400,000)` plus the measured \
         instruction, registrar as fee payer; the figure is `compute_units_consumed` of the whole transaction.\n\
         - Plain rows: legacy SPL Token cash mint (as `setup_bond` creates), no withholding tax, 10 units per \
         holder. The SPL Token program is the build LiteSVM bundles: {spl_token_build}.\n\
         - `{PAY_WORST}`: Token-2022 cash mint without extensions (tKZT-like) and 15% withholding tax, so each \
         holder costs two Token-2022 transfers (net to the holder, tax to the vault).\n\
         - `{RETIRE_WORST}`: every holder suspended, so each frozen account is thawed before the burn.\n\
         - `snapshot_batch` creates one Entitlement per holder. The single calls come from the {CLI_PAY_BATCH}-holder coupon; \
         `release_trade` re-freezes an empty escrow, the forced one first returns 10 units to the seller.\n\
         - Holders, mints and therefore PDAs are random keys, so the figures vary from run to run — `snapshot_batch` \
         most, because it derives each Entitlement PDA on-chain (one bump search per holder).\n\
         - LiteSVM does not enforce the 1232-byte packet size: `pay_batch` with {PAY_BATCH_MAX} holders is a \
         compute figure only; on a cluster that batch needs a v0 transaction with an address lookup table, which \
         is why the CLI sends {CLI_PAY_BATCH}.\n"
    )
    .unwrap();
    md
}

#[test]
fn batches_stay_inside_the_compute_limits() {
    // Sizes: one holder, the CLI pay batch, the pay maximum, the snapshot maximum (pay batches cap at PAY_BATCH_MAX).
    let coupons = |worst| {
        [1, CLI_PAY_BATCH, PAY_BATCH_MAX, SNAPSHOT_BATCH_MAX].map(|n| (n, flow(n, false, worst)))
    };
    let (plain, worst) = (coupons(false), coupons(true));
    let row = |name, holders, cu| Row { name, holders, cu };
    let mut rows: Vec<Row> = vec![];
    rows.extend(
        plain
            .iter()
            .filter(|(n, _)| *n <= SNAPSHOT_BATCH_MAX)
            .map(|(n, f)| row("snapshot_batch", *n, f.snapshot)),
    );
    let payable = |n: &usize| *n <= PAY_BATCH_MAX;
    rows.extend(
        plain
            .iter()
            .filter(|(n, _)| payable(n))
            .map(|(n, f)| row("pay_batch", *n, f.pay)),
    );
    rows.extend(
        worst
            .iter()
            .filter(|(n, _)| payable(n))
            .map(|(n, f)| row(PAY_WORST, *n, f.pay)),
    );
    for (name, frozen) in [("retire_batch", false), (RETIRE_WORST, true)] {
        rows.extend([1, 5, RETIRE_BATCH_MAX].map(|n| row(name, n, retire(n, frozen))));
    }
    let single = &plain
        .iter()
        .find(|(n, _)| *n == CLI_PAY_BATCH)
        .expect("CLI-size coupon")
        .1;
    let [admit, release, forced] = trades();
    rows.extend(
        [
            ("strike_record", single.strike),
            ("finalize_snapshot", single.finalize),
            ("fund_action", single.fund),
            ("complete_action", single.complete),
            ("admit_trade", admit),
            ("release_trade", release),
            ("release_trade (force)", forced),
        ]
        .map(|(name, cu)| row(name, 0, cu)),
    );

    // p-token is loaded under the upgradeable loader, SPL Token 3.5.0 under the legacy one (litesvm programs/mod.rs).
    let spl_token_build = match single.env.svm.get_account(&spl_token::ID) {
        Some(a) if a.owner == bpf_loader_upgradeable::ID => {
            "p-token (pinocchio), not a devnet dump; a cluster still on the older SPL Token build pays more \
             per SPL cash transfer than measured here"
        }
        _ => "SPL Token 3.5.0, not a devnet dump",
    };
    let md = report(&rows, spl_token_build);
    println!("{md}"); // shown when an assertion below fails

    for r in &rows {
        assert!(r.cu < TX_MAX_CU, "{} × {}: {} CU", r.name, r.holders, r.cu);
    }
    for (ix, _, _, cli) in BATCHES {
        let sent = at(&rows, ix, cli);
        assert!(
            sent < CLI_CU_LIMIT,
            "{ix} × {cli}: {sent} CU exceeds the CLI limit"
        );
    }

    if std::env::var("QUPON_WRITE_CU_REPORT").as_deref() == Ok("1") {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../reports/cu-benchmarks.md"
        );
        std::fs::write(path, md).expect("write reports/cu-benchmarks.md");
    }
}
