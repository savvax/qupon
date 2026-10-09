---
id: 1501
title: crate — civil clock and signed accrued interest
agent: glm
tier: T0
depends_on: []
verify: make verify
timeout_min: 60
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1501 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/02-architecture.md
- docs/03-domain.md
- programs/qupon_bonds/tests/common/mod.rs

## Plan section
### Task 1501: crate — civil clock and signed accrued interest

**Agent:** glm · **Depends on:** — · **Role:** anchor (entitlement crate)

**Files:**
- Modify: `crates/entitlement/src/lib.rs` (append; nothing existing changes)
- Modify: `fixtures/entitlement.json` (add `clock_cases`, `accrued_cases`)
- Test: `crates/entitlement/tests/fixtures.rs` (two new test fns)

**Interfaces — Produces:**
- `pub struct CivilClock { pub day_secs: i64, pub anchor_ts: i64, pub anchor_days: i64 }`
- `CivilClock::real(utc_offset_secs: i64) -> CivilClock` · `CivilClock::demo(day_secs: u32, issue_ts: i64, issue: Ymd) -> Result<CivilClock>`
- `fn is_midnight(&self, ts: i64) -> bool` · `fn civil(&self, ts: i64) -> Result<Ymd>` · `fn floor_civil(&self, ts: i64) -> Result<Ymd>` · `fn ts(&self, d: Ymd) -> Result<i64>` · `fn add_months(&self, ts: i64, months: u32) -> Result<i64>` · `fn is_demo(&self) -> bool`
- `Ymd::from_days(days: i64) -> Result<Ymd>`
- `pub fn accrued_signed(units: u64, face: u64, rate_bps: u32, dc: DayCount, start: Ymd, settle: Ymd) -> Result<(i64 /*amount*/, i32 /*days*/)>`

- [ ] **Step 1: failing tests** in `crates/entitlement/tests/fixtures.rs`:

```rust
#[test]
fn clock_cases_match() {
    let f = load(); // existing helper that parses fixtures/entitlement.json
    for c in f["clock_cases"].as_array().unwrap() {
        let clock = if c["day_secs"].as_u64().unwrap() == 0 {
            CivilClock::real(5 * 3600)
        } else {
            CivilClock::demo(c["day_secs"].as_u64().unwrap() as u32, c["issue_ts"].as_i64().unwrap(),
                             Ymd::from_packed(c["issue_ymd"].as_u64().unwrap() as u32).unwrap()).unwrap()
        };
        let d = Ymd::from_packed(c["ymd"].as_u64().unwrap() as u32).unwrap();
        assert_eq!(clock.ts(d).unwrap(), c["ts"].as_i64().unwrap(), "{}", c["id"]);
        assert_eq!(clock.civil(c["ts"].as_i64().unwrap()).unwrap(), d, "{}", c["id"]);
        let m = c["plus_months"].as_u64().unwrap() as u32;
        assert_eq!(clock.add_months(c["ts"].as_i64().unwrap(), m).unwrap(), c["plus_months_ts"].as_i64().unwrap(), "{}", c["id"]);
    }
}

#[test]
fn accrued_cases_match() {
    let f = load();
    for c in f["accrued_cases"].as_array().unwrap() {
        let dc = day_count(&c["day_count"]); // existing helper mapping "THIRTY_360" etc.
        let (amount, days) = accrued_signed(
            c["units"].as_u64().unwrap(), c["face"].as_u64().unwrap(), c["rate_bps"].as_u64().unwrap() as u32, dc,
            ymd(&c["start"]), ymd(&c["settle"])).unwrap();
        assert_eq!((amount, days), (c["accrued"].as_i64().unwrap(), c["days"].as_i64().unwrap() as i32), "{}", c["id"]);
    }
}
```

- [ ] **Step 2: vectors** — add to `fixtures/entitlement.json` (values below were computed independently: real = `days_from_epoch(ymd) × 86400 − 18000`, demo = `issue_ts + (days(ymd) − days(issue_ymd)) × day_secs`):

```json
"clock_cases": [
  {"id":"real_coupon_date","day_secs":0,"ymd":20270103,"ts":1798916400,"plus_months":6,"plus_months_ts":1814554800},
  {"id":"real_eom_clamp","day_secs":0,"ymd":20260831,"ts":1788116400,"plus_months":6,"plus_months_ts":1803754800},
  {"id":"demo_1s_issue","day_secs":1,"issue_ts":1791000000,"issue_ymd":20261009,"ymd":20261009,"ts":1791000000,"plus_months":6,"plus_months_ts":1791000182},
  {"id":"demo_1s_maturity","day_secs":1,"issue_ts":1791000000,"issue_ymd":20261009,"ymd":20271009,"ts":1791000365,"plus_months":0,"plus_months_ts":1791000365},
  {"id":"demo_2s_eom","day_secs":2,"issue_ts":1791000000,"issue_ymd":20260831,"ymd":20260831,"ts":1791000000,"plus_months":6,"plus_months_ts":1791000362}
],
"accrued_cases": [
  {"id":"trade_5_bonds_30_days","units":5,"face":100000,"rate_bps":1000,"day_count":"THIRTY_360","start":"2026-10-03","settle":"2026-11-03","days":30,"accrued":4167},
  {"id":"ex_coupon_negative_1_day","units":10,"face":100000,"rate_bps":1000,"day_count":"THIRTY_360","start":"2027-01-03","settle":"2027-01-02","days":-1,"accrued":-278},
  {"id":"settle_on_period_start","units":65,"face":100000,"rate_bps":1000,"day_count":"THIRTY_360","start":"2027-01-03","settle":"2027-01-03","days":0,"accrued":0},
  {"id":"act365_btrk_47_days","units":1000,"face":1000000,"rate_bps":1595,"day_count":"ACT_365","start":"2026-08-23","settle":"2026-10-09","days":47,"accrued":20538356}
]
```

(`ex_coupon_negative_1_day`: 10 × 100,000 × 1,000 × 1 / 3,600,000 = 277.78 → −278 by half-up on the magnitude. `act365_btrk_47_days`: 1000 × 1,000,000 × 1,595 × 47 / 3,650,000 = 20,538,356.16 → 20,538,356. If a hand check disagrees with your implementation, the implementation is wrong — vectors are the contract; ask in `reports/questions/1501-*.md` only if a vector itself is arithmetically wrong.)

- [ ] **Step 3: run** `cargo test -p entitlement` → the two new tests fail to compile.
- [ ] **Step 4: implement** (append to `crates/entitlement/src/lib.rs`):

```rust
impl Ymd {
    /// Civil date from days since 1970-01-01.
    pub fn from_days(days: i64) -> Result<Ymd, Error> {
        Ymd::from_unix_utc(days.checked_mul(86_400).ok_or(Error::Overflow)?)
    }
}

/// Maps civil dates to timestamps. Real: Almaty midnights (day = 86 400 s, offset from UTC). Demo: day = `day_secs`
/// seconds counted from the issue timestamp, so a whole bond life fits in minutes with the same civil-day math.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CivilClock { pub day_secs: i64, pub anchor_ts: i64, pub anchor_days: i64 }

impl CivilClock {
    pub fn real(utc_offset_secs: i64) -> CivilClock { CivilClock { day_secs: 86_400, anchor_ts: -utc_offset_secs, anchor_days: 0 } }
    pub fn demo(day_secs: u32, issue_ts: i64, issue: Ymd) -> Result<CivilClock, Error> {
        if day_secs == 0 || day_secs >= 86_400 { return Err(Error::InvalidPeriod); }
        Ok(CivilClock { day_secs: i64::from(day_secs), anchor_ts: issue_ts, anchor_days: issue.days_from_epoch() })
    }
    pub fn is_demo(&self) -> bool { self.day_secs != 86_400 }
    pub fn is_midnight(&self, ts: i64) -> bool { ts.checked_sub(self.anchor_ts).is_some_and(|d| d.rem_euclid(self.day_secs) == 0) }
    /// Civil date of a midnight timestamp (error if `ts` is not a midnight of this clock).
    pub fn civil(&self, ts: i64) -> Result<Ymd, Error> {
        if !self.is_midnight(ts) { return Err(Error::InvalidDate); }
        self.floor_civil(ts)
    }
    /// Civil date containing `ts` (any time of day).
    pub fn floor_civil(&self, ts: i64) -> Result<Ymd, Error> {
        let d = ts.checked_sub(self.anchor_ts).ok_or(Error::Overflow)?.div_euclid(self.day_secs);
        Ymd::from_days(self.anchor_days.checked_add(d).ok_or(Error::Overflow)?)
    }
    pub fn ts(&self, d: Ymd) -> Result<i64, Error> {
        d.days_from_epoch().checked_sub(self.anchor_days)
            .and_then(|n| n.checked_mul(self.day_secs))
            .and_then(|x| x.checked_add(self.anchor_ts))
            .ok_or(Error::Overflow)
    }
    pub fn add_months(&self, ts: i64, months: u32) -> Result<i64, Error> { self.ts(self.civil(ts)?.add_months(months)?) }
}

/// Accrued interest for `units` from `start` to `settle` (negative when `settle` precedes `start`: ex-coupon window).
/// Half-up on the magnitude, once per position — the same convention as coupons (03-domain §2).
pub fn accrued_signed(units: u64, face: u64, rate_bps: u32, dc: DayCount, start: Ymd, settle: Ymd) -> Result<(i64, i32), Error> {
    let (a, b, sign) = if settle >= start { (start, settle, 1i64) } else { (settle, start, -1i64) };
    let days = if a == b { 0 } else { accrual_days(dc, a, b)? };
    let num = u128::from(units).checked_mul(u128::from(face)).and_then(|x| x.checked_mul(u128::from(rate_bps)))
        .and_then(|x| x.checked_mul(u128::from(days))).ok_or(Error::Overflow)?;
    let amount = round_half_up(num, BPS * u128::from(dc.basis()?));
    let amount = i64::try_from(amount).map_err(|_| Error::Overflow)?;
    Ok((sign * amount, (sign as i32) * i32::try_from(days).map_err(|_| Error::Overflow)?))
}
```

(`Ymd` must derive `PartialOrd, Ord` for `settle >= start`; add the derive if missing — field order y, m, d makes it chronological.)
- [ ] **Step 5: run** `cargo test -p entitlement` → all pass; `cargo clippy -p entitlement -- -D warnings`.
- [ ] **Step 6: commit** `feat(entitlement): civil clock (real/demo) and signed accrued interest` with `task: 1501`; worklog.

**Acceptance:** both new tests pass on every vector; no existing crate test changed; `make verify` green.

## Finish
`make verify` green, commits carry `task: 1501`, `reports/worklog/1501.md` written. Print `DONE:1501` or `BLOCKED:1501 <reason>`.
