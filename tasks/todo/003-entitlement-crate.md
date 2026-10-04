---
id: 003
title: crates/entitlement: deterministic coupon/principal/tax math + day counts, driven by fixtures
agent: claude
tier: T0
depends_on: [001]
verify: make verify
timeout_min: 60
---
## Goal
Implement the pure math used by the program and mirrored by Go: 30E/360 and ACT/365 day counts, half-up rounding per holder, gross/tax/net/principal, with every vector in `fixtures/entitlement.json` as a test.

## Read first
- docs/03-domain.md (§2, §3, §8)
- fixtures/entitlement.json

## Steps
1. `no_std`-compatible core (feature `std` for tests); types: `DayCount {Thirty360, Act365, ActAct}`, `Kind {Interest, Redemption, EarlyRedemption, PartialRedemption, Meeting, TermsChange}`, `Ymd {y:u16,m:u8,d:u8}` with `from_packed(u32)` (yyyymmdd) and `from_unix_utc(i64)` (Hinnant civil_from_days).
2. `fn accrual_days(dc, start: Ymd, end: Ymd) -> Result<u32, Error>` (ActAct → `Unsupported`).
3. `fn round_half_up(num: u128, den: u128) -> u128`.
4. `fn entitlement(units: u64, face: u64, rate_bps: u32, dc, days: u32, tax_bps: u16, kind) -> Result<Entitlement{gross,tax,net,principal}, Error>` with overflow → `Error::Overflow`; principal = units*face for Redemption/EarlyRedemption; 0 otherwise (PartialRedemption takes a `factor_bps` variant).
5. `fn per_unit_gross(face, rate_bps, dc, days) -> u64` (informational).
6. Tests: iterate `fixtures/entitlement.json` (serde_json) for both `day_count_cases` and `cases`; plus property test (proptest) that Σ holders' gross is within `holders` of `supply*per_unit`.

## Acceptance criteria
- [ ] `cargo test -p entitlement` passes every fixture id; a failing fixture names the id in the assertion message.
- [ ] Crate compiles for `target = sbf` when used from the program (no std-only deps in the core).
- [ ] `cargo clippy -- -D warnings` clean; public API documented with `///`.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/003.md`, then print exactly `DONE:003` or `BLOCKED:003 <reason>`.
