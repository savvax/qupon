//! Cross-language snapshot-hash vectors: `fixtures/snapshot_hash.json` pins both on-chain hash schemes so
//! the program, the TS client and the Go registrar provably agree on the audit anchor of every action.
//!
//! Every hash is produced by running the real instructions in LiteSVM (announce → strike → snapshot_batch),
//! never by re-implementing the hash. Scheme 0 (rolling, owner-sorted) only exists on actions announced
//! before plan 15, so its cases rewrite `hash_scheme` on a freshly announced action — the legacy state the
//! registrar still has to reconcile — and then snapshot through the real program path. All keys are derived
//! from seeds, so the vectors are byte-stable across runs.
//!
//! ```sh
//! EXPORT_FIXTURES=1 cargo test -p qupon_bonds --test snapshot_hash_fixtures -- --nocapture
//! ```
//!
//! Without `EXPORT_FIXTURES` the test re-runs every case and asserts the committed file still matches.

mod common;

use std::{fmt::Write as _, fs, path::Path};

use anchor_lang::{prelude::Pubkey, AccountSerialize};
use anchor_spl::token::spl_token;
use common::*;
use qupon_bonds::{CorporateAction, SNAPSHOT_BATCH_MAX};
use sha2::{Digest, Sha256};
use solana_keypair::Keypair;
use solana_signer::Signer;

/// Deterministic keypair: sha256 of the label is the ed25519 secret key.
fn det_keypair(label: &str) -> Keypair {
    let mut h = Sha256::new();
    h.update(b"qupon:snapshot-hash-vector:");
    h.update(label.as_bytes());
    Keypair::new_from_array(h.finalize().into())
}

struct Case {
    id: &'static str,
    scheme: u8,
    action: Pubkey,
    /// In the order written to the JSON (may deliberately be unsorted; see `exec_desc`).
    holders: Vec<(Pubkey, u64)>,
    hash: [u8; 32],
}

/// Full record-date run for one case: fresh deterministic bond, holders registered (and issued `units`,
/// a 0-unit holder is only registered), INTR #0 announced, scheme 0 rewriting the action to the legacy
/// pre-plan-15 state, then snapshot batches over the holders ordered as the CLI would send them
/// (`exec_desc` inverts the order to prove scheme 1's order independence on-chain).
fn run_case(
    base: &str,
    id: &'static str,
    scheme: u8,
    units: &[u64],
    exec_desc: bool,
    json_desc: bool,
) -> Case {
    let mut env = Env::new();
    let cash = env.create_cash_mint(spl_token::ID);
    let mint = det_keypair(&format!("{base}:mint"));
    let (mint_pk, series) = env.create_bond_mint_from(mint, BondMintOpts::default());
    let ix = env.init_series_ix(mint_pk, cash, spl_token::ID, env.params());
    env.send(&[ix], &[]).expect("init_series");
    let b = Bond {
        mint: mint_pk,
        series,
        cash,
        cash_tp: spl_token::ID,
    };

    let mut holders: Vec<(Pubkey, u64)> = vec![];
    let issuer = env.issuer.insecure_clone();
    for (i, &u) in units.iter().enumerate() {
        let owner = det_keypair(&format!("{base}:holder{i}"));
        let pk = owner.pubkey();
        env.attest(&pk, &kyc_for(&pk), 0);
        let ix = env.register_ix(&b, &env.registrar.pubkey(), &pk);
        env.send(&[ix], &[]).expect("register");
        if u > 0 {
            let ix = env.issue_ix(&b, &issuer.pubkey(), &pk, u);
            env.send(&[ix], &[&issuer]).expect("issue");
        }
        holders.push((pk, u));
    }

    let now = env.now();
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), intr_args(now));
    env.send(&[ix], &[]).expect("announce");
    let action = action_pda(&b.series, 0);
    if scheme == 0 {
        set_hash_scheme(&mut env, &action, 0);
    }
    env.set_clock(now + 60);
    let ix = env.strike_ix(&b, &env.registrar.pubkey(), 0);
    env.send(&[ix], &[]).expect("strike");

    // The registrar batches owners ordered by pubkey (scheme 0's rolling hash demands it).
    let mut order: Vec<usize> = (0..holders.len()).collect();
    order.sort_by_key(|&i| holders[i].0);
    if exec_desc {
        order.reverse();
    }
    for chunk in order.chunks(SNAPSHOT_BATCH_MAX) {
        let owners: Vec<Pubkey> = chunk.iter().map(|&i| holders[i].0).collect();
        let ix = env.snapshot_ix(&b, 0, &owners);
        env.send(&[ix], &[]).expect("snapshot batch");
    }

    let mut json_holders = holders.clone();
    if json_desc {
        json_holders.reverse();
    }
    Case {
        id,
        scheme,
        action,
        holders: json_holders,
        hash: env.account::<CorporateAction>(&action).snapshot_hash,
    }
}

/// Rewrite `hash_scheme` on the announced action: no live instruction creates scheme-0 actions any more
/// (announce always sets 1), but legacy actions from before plan 15 exist on-chain and must reconcile.
fn set_hash_scheme(env: &mut Env, action: &Pubkey, scheme: u8) {
    let acc = env.svm.get_account(action).expect("action exists");
    let mut a: CorporateAction = env.account(action);
    a.hash_scheme = scheme;
    let mut data = acc.data.clone();
    a.try_serialize(&mut &mut data[..]).expect("reserialize");
    env.svm
        .set_account(
            *action,
            solana_account::Account {
                lamports: acc.lamports,
                data,
                owner: acc.owner,
                executable: false,
                rent_epoch: 0,
            },
        )
        .expect("set action");
}

fn all_cases() -> Vec<Case> {
    let cases = vec![
        run_case("scheme0_single", "scheme0_single", 0, &[65], false, false),
        run_case(
            "scheme0_brief_3",
            "scheme0_brief_3",
            0,
            &[10, 25, 65],
            false,
            false,
        ),
        // Same action and holders as scheme0_brief_3, listed owner-descending: consumers must sort
        // for scheme 0 — and land on the same hash as the sorted listing above.
        run_case(
            "scheme0_brief_3",
            "scheme0_unsorted",
            0,
            &[10, 25, 65],
            false,
            true,
        ),
        run_case(
            "scheme0_zero_unit",
            "scheme0_zero_unit",
            0,
            &[10, 25, 0],
            false,
            false,
        ),
        run_case(
            "scheme1_brief_3",
            "scheme1_brief_3",
            1,
            &[10, 25, 65],
            false,
            false,
        ),
        // Same action, same set, snapshot sent ascending vs descending → one hash (order independence).
        run_case(
            "scheme1_order",
            "scheme1_order_asc",
            1,
            &[10, 25, 65],
            false,
            false,
        ),
        run_case(
            "scheme1_order",
            "scheme1_order_desc",
            1,
            &[10, 25, 65],
            true,
            true,
        ),
        run_case(
            "scheme1_zero_unit",
            "scheme1_zero_unit",
            1,
            &[10, 25, 0],
            false,
            false,
        ),
        // 20 holders → three batches of ≤ 8 positions.
        run_case(
            "scheme1_twenty",
            "scheme1_twenty",
            1,
            &(1..=20).collect::<Vec<_>>(),
            false,
            false,
        ),
    ];
    let asc = cases.iter().find(|c| c.id == "scheme1_order_asc");
    let desc = cases.iter().find(|c| c.id == "scheme1_order_desc");
    assert_eq!(
        asc.expect("order_asc case").hash,
        desc.expect("order_desc case").hash,
        "scheme 1 must be order-independent"
    );
    cases
}

fn render(cases: &[Case]) -> String {
    let mut j = String::from("{\n");
    let _ = writeln!(j, r#"  "$schema": "qupon snapshot hash test vectors v1","#);
    let _ = writeln!(
        j,
        r#"  "notes": "Hashes produced by the real program instructions in LiteSVM (export test). scheme 0 = rolling sha256(prev | owner | units_le) over holders sorted owner-ascending; scheme 1 = XOR over holders of sha256(\"qupon:snap:v1\" | action | owner | units_le), order-independent. Zero-unit holders contribute nothing (the program skips them). Consumer suites must sort scheme-0 holders by owner bytes; the scheme0_unsorted vector pins this, scheme1_order_asc/desc pin order independence.","#
    );
    j.push_str("  \"cases\": [\n");
    for (i, c) in cases.iter().enumerate() {
        let holders: Vec<String> = c
            .holders
            .iter()
            .map(|(o, u)| format!(r#"{{"owner": "{o}", "units": {u}}}"#))
            .collect();
        let _ = writeln!(
            j,
            "    {{\"id\": \"{}\", \"scheme\": {}, \"action\": \"{}\", \"holders\": [{}], \"hash\": \"{}\"}}{}",
            c.id,
            c.scheme,
            c.action,
            holders.join(", "),
            c.hash.iter().map(|b| format!("{b:02x}")).collect::<String>(),
            if i + 1 == cases.len() { "" } else { "," },
        );
    }
    j.push_str("  ]\n}\n");
    j
}

#[test]
fn snapshot_hash_vectors() {
    let json = render(&all_cases());
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/snapshot_hash.json");
    if std::env::var("EXPORT_FIXTURES").ok().as_deref() == Some("1") {
        fs::write(&path, &json).expect("write fixtures/snapshot_hash.json");
        println!("fixtures written to {}", path.display());
        return;
    }
    let committed = fs::read_to_string(&path)
        .expect("fixtures/snapshot_hash.json must be committed; re-run with EXPORT_FIXTURES=1");
    assert_eq!(
        json, committed,
        "fixtures/snapshot_hash.json is stale: re-run \
         EXPORT_FIXTURES=1 cargo test -p qupon_bonds --test snapshot_hash_fixtures -- --nocapture"
    );
}
