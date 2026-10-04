use entitlement::{
    accrual_days, entitlement, per_unit_gross, round_half_up, rounding_within_tolerance, DayCount,
    Error, Kind, Ymd,
};
use proptest::prelude::*;
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixtures {
    day_count_cases: Vec<DayCase>,
    cases: Vec<Case>,
    totals_check: Totals,
}

#[derive(Deserialize)]
struct DayCase {
    id: String,
    day_count: String,
    start: String,
    end: String,
    days: u32,
}

#[derive(Deserialize)]
struct Case {
    id: String,
    kind: String,
    units: u64,
    face: u64,
    rate_bps: u32,
    day_count: String,
    days: u32,
    tax_bps: u16,
    gross: u64,
    tax: u64,
    net: u64,
    principal: u64,
}

#[derive(Deserialize)]
struct Totals {
    supply: u64,
    per_unit_gross: u64,
    sum_gross: u64,
    max_drift_allowed: u64,
}

fn load() -> Fixtures {
    serde_json::from_str(include_str!("../../../fixtures/entitlement.json"))
        .expect("fixtures/entitlement.json parses")
}

fn dc(s: &str) -> DayCount {
    match s {
        "THIRTY_360" => DayCount::Thirty360,
        "ACT_365" => DayCount::Act365,
        "ACT_ACT" => DayCount::ActAct,
        other => panic!("unknown day_count {other}"),
    }
}

fn kind(s: &str) -> Kind {
    match s {
        "INTR" => Kind::Interest,
        "REDM" => Kind::Redemption,
        "MCAL" => Kind::EarlyRedemption,
        other => panic!("unknown kind {other}"),
    }
}

fn ymd(s: &str) -> Ymd {
    let packed: u32 = s.replace('-', "").parse().expect("yyyy-mm-dd");
    Ymd::from_packed(packed).expect("valid date")
}

#[test]
fn day_count_cases() {
    for c in load().day_count_cases {
        let got = accrual_days(dc(&c.day_count), ymd(&c.start), ymd(&c.end));
        assert_eq!(got, Ok(c.days), "day_count_cases[{}]", c.id);
    }
}

#[test]
fn entitlement_cases() {
    for c in load().cases {
        let e = entitlement(
            c.units,
            c.face,
            c.rate_bps,
            dc(&c.day_count),
            c.days,
            c.tax_bps,
            kind(&c.kind),
        )
        .unwrap_or_else(|err| panic!("cases[{}]: {err:?}", c.id));
        assert_eq!(
            (e.gross, e.tax, e.net, e.principal),
            (c.gross, c.tax, c.net, c.principal),
            "cases[{}] (gross, tax, net, principal)",
            c.id
        );
    }
}

#[test]
fn totals_check() {
    let f = load();
    let t = f.totals_check;
    let pu = per_unit_gross(100_000, 1000, DayCount::Thirty360, 180).unwrap();
    assert_eq!(pu, t.per_unit_gross);
    let sum: u64 = f
        .cases
        .iter()
        .filter(|c| c.id.starts_with("brief_coupon_"))
        .map(|c| c.gross)
        .sum();
    assert_eq!(sum, t.sum_gross);
    assert!(sum.abs_diff(t.supply * pu) <= t.max_drift_allowed);
    assert!(
        rounding_within_tolerance(sum, t.supply, 3, 100_000, 1000, DayCount::Thirty360, 180)
            .unwrap()
    );
}

#[test]
fn half_up_not_bankers() {
    assert_eq!(round_half_up(1, 2), 1);
    assert_eq!(round_half_up(5, 2), 3);
    assert_eq!(round_half_up(4, 3), 1);
    assert_eq!(round_half_up(5, 3), 2);
    assert_eq!(round_half_up(0, 7), 0);
}

#[test]
fn mcal_drift_vs_rounded_per_unit() {
    // 10 units, 47 days: holder gross 20,824 but 10 × per_unit (2,082) = 20,820 — must still pass.
    assert!(
        rounding_within_tolerance(20_824, 10, 1, 100_000, 1595, DayCount::Thirty360, 47).unwrap()
    );
    assert!(
        !rounding_within_tolerance(20_826, 10, 1, 100_000, 1595, DayCount::Thirty360, 47).unwrap()
    );
}

#[test]
fn errors() {
    let d = ymd("2026-07-03");
    assert_eq!(
        accrual_days(DayCount::ActAct, d, d),
        Err(Error::UnsupportedDayCount)
    );
    assert_eq!(
        accrual_days(DayCount::Thirty360, ymd("2027-01-03"), d),
        Err(Error::InvalidPeriod)
    );
    assert_eq!(Ymd::from_packed(20260230), Err(Error::InvalidDate));
    assert_eq!(Ymd::from_packed(20261301), Err(Error::InvalidDate));
    assert_eq!(
        entitlement(
            u64::MAX,
            u64::MAX,
            u32::MAX,
            DayCount::Thirty360,
            180,
            0,
            Kind::Interest
        ),
        Err(Error::Overflow)
    );
    assert_eq!(DayCount::try_from(3), Err(Error::InvalidCode));
    assert_eq!(Kind::from_code(6, 0), Err(Error::InvalidCode));
}

#[test]
fn partial_redemption_factor() {
    let e = entitlement(
        10,
        100_000,
        1000,
        DayCount::Thirty360,
        180,
        0,
        Kind::PartialRedemption { factor_bps: 2500 },
    )
    .unwrap();
    assert_eq!(
        (e.gross, e.principal, e.payout().unwrap()),
        (50_000, 250_000, 300_000)
    );
}

#[test]
fn unix_dates() {
    assert_eq!(
        Ymd::from_unix_utc(0),
        Ok(Ymd {
            y: 1970,
            m: 1,
            d: 1
        })
    );
    // 2026-07-03 00:00 Asia/Almaty = 2026-07-02 19:00 UTC → UTC civil date is the previous day (§3).
    assert_eq!(
        Ymd::from_unix_utc(1_783_018_800),
        Ok(Ymd {
            y: 2026,
            m: 7,
            d: 2
        })
    );
    assert_eq!(
        Ymd::from_unix_utc(-1),
        Ok(Ymd {
            y: 1969,
            m: 12,
            d: 31
        })
    );
}

proptest! {
    #[test]
    fn civil_roundtrip(days in -719_000i64..2_000_000) {
        let d = Ymd::from_unix_utc(days * 86_400).unwrap();
        prop_assert_eq!(d.days_from_epoch(), days);
        prop_assert_eq!(Ymd::new(d.y, d.m, d.d), Ok(d));
    }

    /// Σ holders' gross stays within holders/2 of supply × the exact per-unit coupon.
    #[test]
    fn sum_of_holders_within_tolerance(
        holdings in prop::collection::vec(0u64..1_000_000, 1..40),
        face in 1u64..10_000_000_000,
        rate_bps in 0u32..5_000,
        days in 0u32..400,
    ) {
        let sum: u64 = holdings
            .iter()
            .map(|&u| entitlement(u, face, rate_bps, DayCount::Thirty360, days, 0, Kind::Interest).unwrap().gross)
            .sum();
        let supply: u64 = holdings.iter().sum();
        let holders = holdings.iter().filter(|&&u| u > 0).count() as u32;
        prop_assert!(rounding_within_tolerance(sum, supply, holders, face, rate_bps, DayCount::Thirty360, days).unwrap());
    }
}
