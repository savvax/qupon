//! Exports real on-chain account bytes + expected decodes to `fixtures/accounts/`
//! for the Go layout-parity tests (`services/registrar/internal/chain/decode_real_test.go`).
//!
//! Off-line path (devnet unavailable): a LiteSVM run of the brief's coupon cycle
//! (10/25/65 units, 10% withholding on one holder) pays the coupon and leaves the
//! action open, so the Series exercises `open_action: Some`.
//!
//! ```sh
//! EXPORT_FIXTURES=1 cargo test -p qupon_bonds --test export_fixtures -- --nocapture
//! ```
//!
//! Devnet alternative: `qupon state:dump --series <name> --raw` (same bytes in `dataB64`).

mod common;

use std::{fmt::Write as _, fs, path::Path};

use anchor_lang::prelude::Pubkey;
use base64::Engine as _;
use common::*;
use qupon_bonds::{CorporateAction, Entitlement, Investor, Series};
use solana_signer::Signer;

/// Fixed-width ASCII field as JSON text (zero padding trimmed).
fn ascii(b: &[u8]) -> String {
    String::from_utf8_lossy(b).trim_end_matches('\0').to_owned()
}

/// Fixed-width byte field (hashes, reserved) as lowercase hex.
fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// `{name}.b64` = full on-chain bytes (incl. the 8-byte Anchor discriminator),
/// `{name}.json` = pubkey + expected decode, snake_case field names like state.rs.
fn write_fixture(dir: &Path, name: &str, pubkey: &Pubkey, data: &[u8], expected: String) {
    let b64 = base64::engine::general_purpose::STANDARD.encode(data);
    fs::write(dir.join(format!("{name}.b64")), format!("{b64}\n")).expect("write .b64");
    fs::write(
        dir.join(format!("{name}.json")),
        format!("{{\n  \"kind\": \"{name}\",\n  \"pubkey\": \"{pubkey}\",\n  \"expected\": {expected}\n}}\n"),
    )
    .expect("write .json");
}

fn series_json(s: &Series) -> String {
    let open = match s.open_action {
        None => "null".to_string(),
        Some(p) => format!("\"{p}\""),
    };
    let mut j = String::from("{\n");
    let _ = writeln!(j, "  \"bump\": {},", s.bump);
    let _ = writeln!(j, "  \"mint\": \"{}\",", s.mint);
    let _ = writeln!(j, "  \"cash_mint\": \"{}\",", s.cash_mint);
    let _ = writeln!(j, "  \"registrar\": \"{}\",", s.registrar);
    let _ = writeln!(j, "  \"issuer\": \"{}\",", s.issuer);
    let _ = writeln!(j, "  \"paying_agent\": \"{}\",", s.paying_agent);
    let _ = writeln!(j, "  \"isin\": \"{}\",", ascii(&s.isin));
    let _ = writeln!(j, "  \"ticker\": \"{}\",", ascii(&s.ticker));
    let _ = writeln!(j, "  \"face_value\": {},", s.face_value);
    let _ = writeln!(j, "  \"coupon_rate_bps\": {},", s.coupon_rate_bps);
    let _ = writeln!(j, "  \"frequency\": {},", s.frequency);
    let _ = writeln!(j, "  \"day_count\": {},", s.day_count);
    let _ = writeln!(j, "  \"issue_date\": {},", s.issue_date);
    let _ = writeln!(j, "  \"maturity_date\": {},", s.maturity_date);
    let _ = writeln!(j, "  \"next_coupon_date\": {},", s.next_coupon_date);
    let _ = writeln!(j, "  \"period_start\": {},", s.period_start);
    let _ = writeln!(j, "  \"status\": {},", s.status);
    let _ = writeln!(j, "  \"total_issued\": {},", s.total_issued);
    let _ = writeln!(j, "  \"action_count\": {},", s.action_count);
    let _ = writeln!(j, "  \"quorum_bps\": {},", s.quorum_bps);
    let _ = writeln!(j, "  \"approval_bps\": {},", s.approval_bps);
    let _ = writeln!(j, "  \"tax_vault\": \"{}\",", s.tax_vault);
    let _ = writeln!(j, "  \"open_action\": {open},");
    let _ = writeln!(j, "  \"reserved\": \"{}\"", hex(&s.reserved));
    j.push('}');
    j
}

fn investor_json(i: &Investor) -> String {
    let mut j = String::from("{\n");
    let _ = writeln!(j, "  \"bump\": {},", i.bump);
    let _ = writeln!(j, "  \"series\": \"{}\",", i.series);
    let _ = writeln!(j, "  \"owner\": \"{}\",", i.owner);
    let _ = writeln!(j, "  \"bond_ata\": \"{}\",", i.bond_ata);
    let _ = writeln!(j, "  \"cash_ata\": \"{}\",", i.cash_ata);
    let _ = writeln!(j, "  \"investor_type\": {},", i.investor_type);
    let _ = writeln!(j, "  \"residency\": {},", i.residency);
    let _ = writeln!(j, "  \"tax_rate_bps\": {},", i.tax_rate_bps);
    let _ = writeln!(j, "  \"status\": {},", i.status);
    let _ = writeln!(j, "  \"kyc_ref\": \"{}\",", hex(&i.kyc_ref));
    let _ = writeln!(j, "  \"registered_at\": {}", i.registered_at);
    j.push('}');
    j
}

fn action_json(a: &CorporateAction) -> String {
    let mut j = String::from("{\n");
    let _ = writeln!(j, "  \"bump\": {},", a.bump);
    let _ = writeln!(j, "  \"series\": \"{}\",", a.series);
    let _ = writeln!(j, "  \"index\": {},", a.index);
    let _ = writeln!(j, "  \"kind\": {},", a.kind);
    let _ = writeln!(j, "  \"mandatory\": {},", a.mandatory);
    let _ = writeln!(j, "  \"corp_id\": \"{}\",", ascii(&a.corp_id));
    let _ = writeln!(j, "  \"official_id\": \"{}\",", ascii(&a.official_id));
    let _ = writeln!(j, "  \"announced_at\": {},", a.announced_at);
    let _ = writeln!(j, "  \"record_at\": {},", a.record_at);
    let _ = writeln!(j, "  \"payment_at\": {},", a.payment_at);
    let _ = writeln!(j, "  \"period_start\": {},", a.period_start);
    let _ = writeln!(j, "  \"period_end\": {},", a.period_end);
    let _ = writeln!(j, "  \"accrual_days\": {},", a.accrual_days);
    let _ = writeln!(j, "  \"rate_bps\": {},", a.rate_bps);
    let _ = writeln!(j, "  \"per_unit_gross\": {},", a.per_unit_gross);
    let _ = writeln!(j, "  \"per_unit_principal\": {},", a.per_unit_principal);
    let _ = writeln!(j, "  \"cash_mint\": \"{}\",", a.cash_mint);
    let _ = writeln!(j, "  \"escrow\": \"{}\",", a.escrow);
    let _ = writeln!(j, "  \"status\": {},", a.status);
    let _ = writeln!(j, "  \"snapshot_slot\": {},", a.snapshot_slot);
    let _ = writeln!(j, "  \"snapshot_hash\": \"{}\",", hex(&a.snapshot_hash));
    let _ = writeln!(j, "  \"units_snapshotted\": {},", a.units_snapshotted);
    let _ = writeln!(j, "  \"holders_snapshotted\": {},", a.holders_snapshotted);
    let _ = writeln!(j, "  \"holders_paid\": {},", a.holders_paid);
    let _ = writeln!(j, "  \"total_gross\": {},", a.total_gross);
    let _ = writeln!(j, "  \"total_tax\": {},", a.total_tax);
    let _ = writeln!(j, "  \"total_net\": {},", a.total_net);
    let _ = writeln!(j, "  \"total_paid\": {},", a.total_paid);
    let _ = writeln!(j, "  \"total_retired\": {},", a.total_retired);
    let _ = writeln!(j, "  \"holders_retired\": {},", a.holders_retired);
    let _ = writeln!(
        j,
        "  \"proposal_new_rate_bps\": {},",
        a.proposal_new_rate_bps
    );
    let _ = writeln!(
        j,
        "  \"proposal_new_maturity\": {},",
        a.proposal_new_maturity
    );
    let _ = writeln!(j, "  \"voting_ends_at\": {},", a.voting_ends_at);
    let _ = writeln!(j, "  \"votes_for\": {},", a.votes_for);
    let _ = writeln!(j, "  \"votes_against\": {},", a.votes_against);
    let _ = writeln!(j, "  \"votes_abstain\": {},", a.votes_abstain);
    let _ = writeln!(j, "  \"result\": {},", a.result);
    let _ = writeln!(j, "  \"completed_at\": {},", a.completed_at);
    let _ = writeln!(j, "  \"factor_bps\": {},", a.factor_bps);
    let _ = writeln!(j, "  \"total_principal\": {},", a.total_principal);
    let _ = writeln!(j, "  \"reserved\": \"{}\"", hex(&a.reserved));
    j.push('}');
    j
}

fn entitlement_json(e: &Entitlement) -> String {
    let mut j = String::from("{\n");
    let _ = writeln!(j, "  \"bump\": {},", e.bump);
    let _ = writeln!(j, "  \"action\": \"{}\",", e.action);
    let _ = writeln!(j, "  \"owner\": \"{}\",", e.owner);
    let _ = writeln!(j, "  \"units\": {},", e.units);
    let _ = writeln!(j, "  \"gross\": {},", e.gross);
    let _ = writeln!(j, "  \"tax\": {},", e.tax);
    let _ = writeln!(j, "  \"net\": {},", e.net);
    let _ = writeln!(j, "  \"principal\": {},", e.principal);
    let _ = writeln!(j, "  \"status\": {},", e.status);
    let _ = writeln!(j, "  \"paid_at\": {},", e.paid_at);
    let _ = writeln!(j, "  \"vote\": {},", e.vote);
    let _ = writeln!(j, "  \"voted_at\": {}", e.voted_at);
    j.push('}');
    j
}

#[test]
fn export_real_account_fixtures() {
    if std::env::var("EXPORT_FIXTURES").ok().as_deref() != Some("1") {
        return; // opt-in export; every normal `cargo test` run skips it
    }
    // The brief's coupon cycle: 10/25/65 units, 10% withholding on the first holder.
    let mut env = Env::new();
    let b = env.setup_bond();
    let holders = env.holders_with_tax(&b, &[(10, 1000), (25, 0), (65, 0)]);
    let owners: Vec<Pubkey> = holders.iter().map(|(k, _)| k.pubkey()).collect();
    env.intr_snapshotted(&b, &owners);
    let issuer = env.issuer.pubkey();
    env.issuer_cash(&b);
    env.fund_cash(&b, &issuer, 500_000);
    let issuer_kp = env.issuer.insecure_clone();
    let ix = env.fund_ix(&b, &issuer, 0, 500_000);
    env.send(&[ix], &[&issuer_kp]).expect("fund");
    let ix = env.pay_ix(&b, 0, &owners);
    env.send(&[ix], &[]).expect("pay");

    let action = action_pda(&b.series, 0);
    // The withholding holder (10 units, 1000 bps) gives the richest investor/entitlement pair.
    let (owner, investor) = owners
        .iter()
        .map(|o| (*o, investor_pda(&b.series, o)))
        .find(|(_, pda)| env.account::<Investor>(pda).tax_rate_bps == 1000)
        .expect("taxed holder registered");
    let entitlement = entitlement_pda(&action, &owner);

    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/accounts");
    fs::create_dir_all(&dir).expect("mkdir fixtures/accounts");
    let raw = |p: &Pubkey| env.svm.get_account(p).expect("account exists").data.clone();
    write_fixture(
        &dir,
        "series",
        &b.series,
        &raw(&b.series),
        series_json(&env.account(&b.series)),
    );
    write_fixture(
        &dir,
        "investor",
        &investor,
        &raw(&investor),
        investor_json(&env.account(&investor)),
    );
    write_fixture(
        &dir,
        "action",
        &action,
        &raw(&action),
        action_json(&env.account(&action)),
    );
    write_fixture(
        &dir,
        "entitlement",
        &entitlement,
        &raw(&entitlement),
        entitlement_json(&env.account(&entitlement)),
    );
    println!("fixtures written to {}", dir.display());
}
