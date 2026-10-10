//! Deterministic randomized invariants for the entitlement math (task 91501).
//!
//! Fixtures prove specific numbers; these properties hold for *every* input drawn from
//! a seeded xorshift64* PRNG (no `rand`/`proptest`): 10_000 iterations per property,
//! fully reproducible. Rules under test: `docs/03-domain.md` §2–§3.

use entitlement::{
    accrual_days, accrued_signed, entitlement, round_half_up, rounding_within_tolerance,
    CivilClock, DayCount, Kind, Ymd,
};

/// Seeded xorshift64* generator — tiny, deterministic, good enough for test inputs.
struct Rng(u64);

impl Rng {
    /// xorshift must never be seeded with 0.
    fn new(seed: u64) -> Self {
        Self(if seed == 0 {
            0x9E37_79B9_7F4A_7C15
        } else {
            seed
        })
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    /// Uniform-ish pick from `lo..=hi` (inclusive).
    fn range(&mut self, lo: u64, hi: u64) -> u64 {
        lo + self.next_u64() % (hi - lo + 1)
    }

    /// Random valid civil date whose days-since-epoch lies in `lo..=hi`.
    fn ymd_in(&mut self, lo: i64, hi: i64) -> Ymd {
        Ymd::from_days(self.range(lo.unsigned_abs(), hi.unsigned_abs()) as i64)
            .expect("days in range decode to a valid Ymd")
    }
}

const ITER: usize = 10_000;
/// Random-date window (days since 1970-01-01): 1970 .. ~2052, far wider than any series life.
const DAYS_LO: i64 = 0;
const DAYS_HI: i64 = 30_000;

/// Both implemented day counts, picked at random.
fn some_dc(rng: &mut Rng) -> DayCount {
    match rng.range(0, 1) {
        0 => DayCount::Thirty360,
        _ => DayCount::Act365,
    }
}

fn some_kind(rng: &mut Rng) -> Kind {
    match rng.range(0, 5) {
        0 => Kind::Interest,
        1 => Kind::Redemption,
        2 => Kind::EarlyRedemption,
        3 => Kind::PartialRedemption {
            factor_bps: rng.range(0, 10_000) as u16,
        },
        4 => Kind::Meeting,
        _ => Kind::TermsChange,
    }
}

/// Per holder: `net + tax == gross` and `tax == round_half_up(gross × tax_bps, 10_000)` (§2).
#[test]
fn per_holder_tax_and_net_add_up() {
    let mut rng = Rng::new(0xC0FFEE00_00000001);
    for _ in 0..ITER {
        let (units, face) = (rng.range(0, 1_000_000), rng.range(1, 1_000_000_000));
        let (rate_bps, days, tax_bps) = (
            rng.range(0, 20_000) as u32,
            rng.range(0, 400) as u32,
            rng.range(0, 10_000) as u16,
        );
        let (dc, kind) = (some_dc(&mut rng), some_kind(&mut rng));
        let e = entitlement(units, face, rate_bps, dc, days, tax_bps, kind)
            .unwrap_or_else(|err| panic!("entitlement returned {err:?}"));
        let tax = round_half_up(u128::from(e.gross) * u128::from(tax_bps), 10_000);
        assert_eq!(
            (e.net as u128 + e.tax as u128, e.tax as u128),
            (e.gross as u128, tax),
            "units={units} face={face} rate={rate_bps} dc={dc:?} days={days} tax_bps={tax_bps}"
        );
    }
}

/// Σ per-holder gross vs the total computed once. Bound proved (h = holders with units > 0,
/// exact per-unit coupon N/D):
///
/// * each holder's half-up error e_i = gross_i − units_i·N/D lies in (−½, ½] (ties round up),
///   so Σ gross − supply·N/D = Σ e_i ∈ (−h/2, h/2] — checked exactly, in scaled integers, by
///   `rounding_within_tolerance` (h = 0 forces Σ == 0);
/// * comparing against `round_half_up(supply·N, D)` adds δ ∈ (−½, ½]; Σ gross − round_total
///   = Σ e_i − δ is an integer strictly inside (−(h+1)/2, (h+1)/2), hence
///   |Σ gross − round_half_up(supply·N, D)| ≤ ⌊h/2⌋ ≤ holders/2 minor units.
#[test]
fn sum_gross_within_holders_half() {
    let mut rng = Rng::new(0xBEEF0000_00000002);
    for _ in 0..ITER {
        let holders = rng.range(1, 50) as usize;
        let (face, rate_bps, days) = (
            rng.range(1, 1_000_000_000),
            rng.range(0, 20_000) as u32,
            rng.range(0, 400) as u32,
        );
        let dc = some_dc(&mut rng);
        let holdings: Vec<u64> = (0..holders).map(|_| rng.range(0, 1_000_000)).collect();
        let sum: u64 = holdings
            .iter()
            .map(|&u| {
                entitlement(u, face, rate_bps, dc, days, 0, Kind::Interest)
                    .unwrap()
                    .gross
            })
            .sum();
        let supply: u64 = holdings.iter().sum();
        let h = holdings.iter().filter(|&&u| u > 0).count() as u32;
        let (num, den) = (
            u128::from(face) * u128::from(rate_bps) * u128::from(days),
            10_000 * u128::from(dc.basis().unwrap()),
        );
        let round_total = round_half_up(num * u128::from(supply), den);
        let bound = u128::from(h) / 2; // ⌊h/2⌋ — integer strictly inside (−(h+1)/2, (h+1)/2)
        assert!(
            (u128::from(sum)).abs_diff(round_total) <= bound,
            "sum={sum} round_total={round_total} h={h} face={face} rate={rate_bps} dc={dc:?} days={days} supply={supply}"
        );
        assert!(
            rounding_within_tolerance(sum, supply, h, face, rate_bps, dc, days).unwrap(),
            "rounding_within_tolerance failed: sum={sum} h={h} face={face} rate={rate_bps} dc={dc:?} days={days}"
        );
    }
}

/// `accrued_signed(start, settle) == −accrued_signed(settle, start)` (amount and days), and
/// `accrued_signed(start, start) == (0, 0)`.
#[test]
fn accrued_antisymmetric_and_zero_on_start() {
    let mut rng = Rng::new(0xD15EA5E0_00000003);
    for _ in 0..ITER {
        let (units, face) = (rng.range(0, 1_000_000), rng.range(1, 1_000_000_000));
        let rate_bps = rng.range(0, 20_000) as u32;
        let (dc, start, settle) = (
            some_dc(&mut rng),
            rng.ymd_in(DAYS_LO, DAYS_HI),
            rng.ymd_in(DAYS_LO, DAYS_HI),
        );
        let fwd = accrued_signed(units, face, rate_bps, dc, start, settle).unwrap();
        let rev = accrued_signed(units, face, rate_bps, dc, settle, start).unwrap();
        assert_eq!(
            (fwd.0 as i128, fwd.1 as i128),
            (-(rev.0 as i128), -(rev.1 as i128)),
            "start={start:?} settle={settle:?} units={units} face={face} rate={rate_bps} dc={dc:?}"
        );
        let (amt0, days0) = accrued_signed(units, face, rate_bps, dc, start, start).unwrap();
        assert_eq!(
            (amt0, days0),
            (0, 0),
            "start==settle must accrue zero: {start:?} units={units}"
        );
    }
}

/// Accrued interest (amount and days) is monotone non-decreasing in the settle date.
/// 30E/360 never steps back across a month end (the day cap only flattens day 31), and
/// `round_half_up(num, den)` is monotone in `num` with `den` fixed.
#[test]
fn accrued_monotonic_in_settle() {
    let mut rng = Rng::new(0xFACE0000_00000004);
    for _ in 0..ITER {
        let (units, face) = (rng.range(0, 1_000_000), rng.range(1, 1_000_000_000));
        let rate_bps = rng.range(0, 20_000) as u32;
        let dc = some_dc(&mut rng);
        let start = rng.ymd_in(DAYS_LO, DAYS_HI - 900);
        let s1 = rng.range(0, 400) as i64;
        let s2 = s1 + rng.range(0, 400) as i64;
        let (settle1, settle2) = (
            Ymd::from_days(start.days_from_epoch() + s1).unwrap(),
            Ymd::from_days(start.days_from_epoch() + s2).unwrap(),
        );
        let a1 = accrued_signed(units, face, rate_bps, dc, start, settle1).unwrap();
        let a2 = accrued_signed(units, face, rate_bps, dc, start, settle2).unwrap();
        assert!(
            a2.0 >= a1.0 && a2.1 >= a1.1,
            "start={start:?} s1={s1} s2={s2} a1={a1:?} a2={a2:?} units={units} face={face} rate={rate_bps} dc={dc:?}"
        );
    }
}

/// 30E/360 counts at most 360 days per 365-day span: with dy = end.y − start.y, a span of
/// ≤ 365 actual days gives either dy = 0 (≤ 30·11 + 29 = 359) or dy = 1 with dm ≤ 0 and,
/// when dm = 0, d2 ≤ d1 (≤ 360); anything larger needs ≥ 366 actual days.
#[test]
fn thirty_e360_never_exceeds_360_per_year() {
    let mut rng = Rng::new(0x5EED0000_00000005);
    for _ in 0..ITER {
        let start = rng.ymd_in(DAYS_LO, DAYS_HI - 400);
        let end = Ymd::from_days(start.days_from_epoch() + rng.range(0, 365) as i64).unwrap();
        let days = accrual_days(DayCount::Thirty360, start, end).unwrap();
        assert!(
            days <= 360,
            "start={start:?} end={end:?} span={days} (> 360 for ≤ 365 actual days)"
        );
    }
}

/// Demo clock roundtrip: `civil(ts(d)) == d` for random dates and `day_secs` in 1..=86399
/// (the last second of a compressed day still floors to the same civil date).
#[test]
fn demo_clock_civil_ts_roundtrip() {
    let mut rng = Rng::new(0xCAFE0000_00000006);
    for _ in 0..ITER {
        let day_secs = rng.range(1, 86_399);
        let issue_days = rng.range(15_000, 20_000) as i64;
        let issue = Ymd::from_days(issue_days).unwrap();
        let clock = CivilClock::demo(day_secs as u32, issue_days * 86_400, issue).unwrap();
        let d = rng.ymd_in(DAYS_LO, DAYS_HI);
        let ts = clock.ts(d).unwrap();
        assert_eq!(
            clock.civil(ts).unwrap(),
            d,
            "day_secs={day_secs} d={d:?} ts={ts}"
        );
        assert_eq!(
            clock.floor_civil(ts + clock.day_secs - 1).unwrap(),
            d,
            "day_secs={day_secs} d={d:?} ts={ts}"
        );
    }
}
