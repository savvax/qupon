---
blocked_reason: agent committed on branch HEAD instead of task/1511-program-demo-clock (work kept on HEAD)
id: 1511
title: program — demo clock per series
agent: glm
tier: T0
depends_on: [1501, 1510]
verify: make verify
timeout_min: 90
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1511 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/02-architecture.md
- docs/03-domain.md
- programs/qupon_bonds/tests/common/mod.rs
- programs/qupon_bonds/tests/hook.rs (transfer-hook gate, spike 1509)

## Plan section
### Task 1511: program — demo clock per series

**Agent:** glm · **Depends on:** 1501, 1510 · **Role:** anchor

**Files:**
- Modify: `state.rs` Series: before `reserved` add `pub day_secs: u32, pub issue_ymd: u32,`; `reserved: [u8; 38]` (46 after 1509, minus 8)
- Create: `programs/qupon_bonds/src/clock.rs` (wrapper over `entitlement::CivilClock`)
- Modify: `init_series.rs` (params `day_secs: u32`, `issue_ymd: u32`; validation via clock), `announce_action.rs` (`civil_matches` → clock), `settle.rs` (`next_coupon_after` → clock), `meeting.rs` (`is_almaty_midnight` → clock)
- Modify TS: `clients/ts/src/lib/clock.ts` (mirror of CivilClock, tested against `fixtures/entitlement.json` `clock_cases`), `src/commands/common.ts` (`almatyMidnight` callers → clock), `series.ts`/`seriesCreate.ts` (`--demo-day-secs <n>`: issue_date = now rounded down to the second, maturity/next dates through the clock), `action.ts`/`lifecycle.ts` (record_at = period_end − 1 series-day; payment_at = period_end; meeting dates through the clock)
- Modify Go: `chain/types.go`/`decode.go` (Series `DaySecs`, `IssueYmd`), `scheduler/scheduler.go` (lead/payment delay in series-days for demo series; tick 2 s when any demo series is open)
- Test: `programs/qupon_bonds/tests/init_series.rs`, new `tests/demo_clock.rs`; `clients/ts/src/lib/clock.test.ts`; Go decode test

**Interfaces — Produces:** `pub struct SeriesClock(CivilClock)` with `SeriesClock::of(&Series) -> Result<Self>`, `::from_params(day_secs, issue_date, issue_ymd) -> Result<Self>`, `.civil(ts)`, `.ts(ymd)`, `.add_months(ts, m)`, `.is_midnight(ts)`, `.grace() -> i64` (one series day), `.is_demo()`. TS `seriesClock(series)` with the same methods. CLI flag `--demo-day-secs`.

- [ ] **Step 1: failing test** `tests/demo_clock.rs`:

```rust
#[test]
fn whole_bond_life_on_a_1s_demo_clock() {
    let mut env = Env::new();
    let issue = env.now();
    // 1-year, semi-annual, 1 civil day = 1 s: coupon 1 at issue+182 s, maturity at issue+365 s
    let b = setup_bond_with(&mut env, BondParams { day_secs: 1, issue_date: issue, issue_ymd: 2026_10_09,
        maturity_date: issue + 365, ..BondParams::brief() });
    let h = holders(&mut env, &b, &[10, 25, 65]);
    let s = fetch_series(&env, &b);
    assert_eq!(s.next_coupon_date, issue + 182);
    let a = announce_intr_demo(&mut env, &b); // period 2026-10-09 → 2027-04-09 = 180 days (30E/360)
    env.set_clock(a.record_at);
    crank_coupon(&mut env, &b, &a, &h);
    assert_eq!(cash_balances(&env, &h), vec![50_000, 125_000, 325_000]);
    let r = announce_redm_demo(&mut env, &b);
    env.set_clock(r.record_at);
    crank_redemption(&mut env, &b, &r, &h);
    assert_eq!(mint_supply(&env, &b), 0);
}

#[test]
fn demo_clock_rejects_non_midnight_maturity() {
    let mut env = Env::new();
    let issue = env.now();
    let err = try_setup_bond(&mut env, BondParams { day_secs: 2, issue_date: issue, issue_ymd: 2026_10_09,
        maturity_date: issue + 731, ..BondParams::brief() }).unwrap_err();
    assert_err(err, "InvalidDates");
}

#[test]
fn real_clock_series_unchanged() {
    // existing brief: day_secs = 0 → identical next_coupon_date to before the refactor
    let mut env = Env::new();
    let b = setup_bond(&mut env);
    assert_eq!(fetch_series(&env, &b).day_secs, 0);
    assert_eq!(fetch_series(&env, &b).next_coupon_date, ALMATY_2027_01_03); // constant already used by brief tests
}
```

- [ ] **Step 2: implement** `clock.rs`:

```rust
//! Civil dates ↔ timestamps for a series: real = Almaty midnights; demo = `day_secs` per civil day (spec D7).
use anchor_lang::prelude::*;
use entitlement::{CivilClock, Ymd};
use crate::{constants::ALMATY_UTC_OFFSET_SECS, error::{math_err, QuponError}, state::Series};

pub struct SeriesClock(pub CivilClock);

impl SeriesClock {
    pub fn from_params(day_secs: u32, issue_date: i64, issue_ymd: u32) -> Result<Self> {
        if day_secs == 0 { return Ok(Self(CivilClock::real(ALMATY_UTC_OFFSET_SECS))); }
        let issue = Ymd::from_packed(issue_ymd).map_err(math_err)?;
        Ok(Self(CivilClock::demo(day_secs, issue_date, issue).map_err(|_| error!(QuponError::InvalidParams))?))
    }
    pub fn of(s: &Series) -> Result<Self> { Self::from_params(s.day_secs, s.issue_date, s.issue_ymd) }
    pub fn civil(&self, ts: i64) -> Result<Ymd> { self.0.civil(ts).map_err(|_| error!(QuponError::InvalidDates)) }
    pub fn ts(&self, d: Ymd) -> Result<i64> { self.0.ts(d).map_err(math_err) }
    pub fn add_months(&self, ts: i64, m: u32) -> Result<i64> { self.0.add_months(ts, m).map_err(math_err) }
    pub fn is_midnight(&self, ts: i64) -> bool { self.0.is_midnight(ts) }
    pub fn grace(&self) -> i64 { self.0.day_secs }
}
```

  `init_series`: build `SeriesClock::from_params(p.day_secs, p.issue_date, p.issue_ymd)`; real mode: require `is_midnight(issue_date)` and store `issue_ymd = civil(issue_date)` (ignore the arg unless non-zero, then require equality); demo: store args; both: require `is_midnight(maturity_date)`, `next_coupon_date = clock.add_months(issue_date, 12 / frequency)`. `civil_matches(ymd, ts)` → `require!(clock.civil(ts)? == Ymd::from_packed(ymd)?, InvalidDates)`. `next_coupon_after` uses `clock.civil` and `clock.add_months`. `meeting.rs` new maturity uses `clock.is_midnight`. Delete `is_almaty_midnight`/`add_months_almaty` only if no caller remains; keep their unit test by moving its cases to `clock.rs` tests (real clock).
- [ ] **Step 3: TS + CLI + Go** as listed; `clock.test.ts` runs `clock_cases`.
- [ ] **Step 4:** `cargo test -p qupon_bonds`, `pnpm --filter @qupon/client test`, `go test ./services/registrar/...`, codama, fixtures export, `make verify`.
- [ ] **Step 5: commit** `feat(program): demo clock per series (day_secs), same civil math` (`task: 1511`).

**Acceptance:** new tests pass; all pre-existing tests unedited and green; `qupon series:create --demo-day-secs 1 …` works against LiteSVM-free unit tests of arg building; account sizes unchanged (size test); `make verify` green.

## Finish
`make verify` green, commits carry `task: 1511`, `reports/worklog/1511.md` written. Print `DONE:1511` or `BLOCKED:1511 <reason>`.
