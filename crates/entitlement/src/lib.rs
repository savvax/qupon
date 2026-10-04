//! Qupon entitlement math: day counts, half-up rounding per holder, gross/tax/net/principal.
//!
//! Pure integer arithmetic (u128 intermediates), `no_std`, shared by the on-chain program and tests;
//! the Go service mirrors it bit-for-bit. Rules: `docs/03-domain.md` §2–§3; vectors: `fixtures/entitlement.json`.
#![no_std]
#![warn(missing_docs)]

/// Basis points denominator (100% = 10_000 bps).
pub const BPS: u128 = 10_000;

/// Errors returned by the math. The program maps them onto its own error codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    /// Intermediate or final value does not fit the target integer type.
    Overflow,
    /// Day count convention not implemented (ACT/ACT is reserved, never faked).
    UnsupportedDayCount,
    /// Not a valid civil date (or year outside `u16`).
    InvalidDate,
    /// Period end precedes period start.
    InvalidPeriod,
    /// Unknown enum code.
    InvalidCode,
}

/// Day count convention; codes match `Series.day_count` in `docs/02-architecture.md`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DayCount {
    /// 30E/360 (default), basis 360.
    Thirty360 = 0,
    /// ACT/ACT — reserved, rejected with [`Error::UnsupportedDayCount`].
    ActAct = 1,
    /// Actual days / 365, basis 365.
    Act365 = 2,
}

impl TryFrom<u8> for DayCount {
    type Error = Error;
    fn try_from(v: u8) -> Result<Self, Error> {
        match v {
            0 => Ok(Self::Thirty360),
            1 => Ok(Self::ActAct),
            2 => Ok(Self::Act365),
            _ => Err(Error::InvalidCode),
        }
    }
}

impl DayCount {
    /// Year basis used as the denominator of the coupon formula.
    pub fn basis(self) -> Result<u32, Error> {
        match self {
            Self::Thirty360 => Ok(360),
            Self::Act365 => Ok(365),
            Self::ActAct => Err(Error::UnsupportedDayCount),
        }
    }
}

/// Corporate action kind; codes match `CorporateAction.kind` (`PartialRedemption` carries its pool factor).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// INTR — coupon payment.
    Interest,
    /// REDM — redemption at maturity (principal + final coupon).
    Redemption,
    /// MCAL — full early redemption (principal + accrued coupon).
    EarlyRedemption,
    /// PCAL — partial redemption of `factor_bps` of face (plus coupon).
    PartialRedemption {
        /// Share of face redeemed, in bps (10_000 = full).
        factor_bps: u16,
    },
    /// BMET — bondholder meeting (no cash).
    Meeting,
    /// CHAN — terms change (no cash).
    TermsChange,
}

impl Kind {
    /// Decode the on-chain `kind` code; `factor_bps` is used only for PCAL (code 3).
    pub fn from_code(code: u8, factor_bps: u16) -> Result<Self, Error> {
        match code {
            0 => Ok(Self::Interest),
            1 => Ok(Self::Redemption),
            2 => Ok(Self::EarlyRedemption),
            3 => Ok(Self::PartialRedemption { factor_bps }),
            4 => Ok(Self::Meeting),
            5 => Ok(Self::TermsChange),
            _ => Err(Error::InvalidCode),
        }
    }

    /// The on-chain `kind` code.
    pub fn code(self) -> u8 {
        match self {
            Self::Interest => 0,
            Self::Redemption => 1,
            Self::EarlyRedemption => 2,
            Self::PartialRedemption { .. } => 3,
            Self::Meeting => 4,
            Self::TermsChange => 5,
        }
    }
}

/// A civil (calendar) date in UTC.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Ymd {
    /// Year.
    pub y: u16,
    /// Month 1–12.
    pub m: u8,
    /// Day 1–31.
    pub d: u8,
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

fn days_in_month(y: i64, m: u8) -> u8 {
    match m {
        4 | 6 | 9 | 11 => 30,
        2 if is_leap(y) => 29,
        2 => 28,
        _ => 31,
    }
}

impl Ymd {
    /// Validated constructor.
    pub fn new(y: u16, m: u8, d: u8) -> Result<Self, Error> {
        if !(1..=12).contains(&m) || d == 0 || d > days_in_month(y as i64, m) {
            return Err(Error::InvalidDate);
        }
        Ok(Self { y, m, d })
    }

    /// From `yyyymmdd` packed into a `u32` (e.g. `20260703`), as passed to `announce_action`.
    pub fn from_packed(v: u32) -> Result<Self, Error> {
        let y = u16::try_from(v / 10_000).map_err(|_| Error::InvalidDate)?;
        Self::new(y, (v / 100 % 100) as u8, (v % 100) as u8)
    }

    /// Civil date (UTC) of a unix timestamp — Howard Hinnant's `civil_from_days`.
    pub fn from_unix_utc(ts: i64) -> Result<Self, Error> {
        let z = ts.div_euclid(86_400) + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z - era * 146_097;
        let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = (doy - (153 * mp + 2) / 5 + 1) as u8;
        let m = if mp < 10 { mp + 3 } else { mp - 9 } as u8;
        let y = yoe + era * 400 + i64::from(m <= 2);
        Ok(Self {
            y: u16::try_from(y).map_err(|_| Error::InvalidDate)?,
            m,
            d,
        })
    }

    /// Days since 1970-01-01 — Howard Hinnant's `days_from_civil`.
    pub fn days_from_epoch(self) -> i64 {
        let m = i64::from(self.m);
        let y = i64::from(self.y) - i64::from(m <= 2);
        let era = y.div_euclid(400);
        let yoe = y - era * 400;
        let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + i64::from(self.d) - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        era * 146_097 + doe - 719_468
    }
}

/// Accrual days between two civil dates under the given convention (§3).
pub fn accrual_days(dc: DayCount, start: Ymd, end: Ymd) -> Result<u32, Error> {
    let days = match dc {
        DayCount::Thirty360 => {
            let d1 = i64::from(start.d.min(30));
            let d2 = i64::from(end.d.min(30));
            360 * (i64::from(end.y) - i64::from(start.y))
                + 30 * (i64::from(end.m) - i64::from(start.m))
                + (d2 - d1)
        }
        DayCount::Act365 => end.days_from_epoch() - start.days_from_epoch(),
        DayCount::ActAct => return Err(Error::UnsupportedDayCount),
    };
    u32::try_from(days).map_err(|_| Error::InvalidPeriod)
}

/// `num / den` rounded half-up (ties away from zero). `den` must be non-zero.
pub fn round_half_up(num: u128, den: u128) -> u128 {
    let (q, r) = (num / den, num % den);
    // 2r >= den  <=>  r >= den - r  (no overflow)
    if r >= den - r {
        q + 1
    } else {
        q
    }
}

/// One holder's entitlement in minor units of the settlement currency.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Entitlement {
    /// Coupon before tax.
    pub gross: u64,
    /// Withheld tax (goes to the tax vault).
    pub tax: u64,
    /// `gross - tax`.
    pub net: u64,
    /// Principal repaid (0 for coupons).
    pub principal: u64,
}

impl Entitlement {
    /// What `pay_batch` transfers to the holder: `net + principal`.
    pub fn payout(&self) -> Result<u64, Error> {
        self.net.checked_add(self.principal).ok_or(Error::Overflow)
    }
}

/// `face * rate_bps * days` and `10_000 * basis`: the exact per-unit coupon as a fraction.
fn coupon_fraction(
    face: u64,
    rate_bps: u32,
    dc: DayCount,
    days: u32,
) -> Result<(u128, u128), Error> {
    let num = u128::from(face)
        .checked_mul(u128::from(rate_bps))
        .and_then(|x| x.checked_mul(u128::from(days)))
        .ok_or(Error::Overflow)?;
    Ok((num, BPS * u128::from(dc.basis()?)))
}

/// Per-holder entitlement (§2). Rounding is per holder, never per unit then multiplied.
pub fn entitlement(
    units: u64,
    face: u64,
    rate_bps: u32,
    dc: DayCount,
    days: u32,
    tax_bps: u16,
    kind: Kind,
) -> Result<Entitlement, Error> {
    let (per_unit_num, den) = coupon_fraction(face, rate_bps, dc, days)?;
    let num = per_unit_num
        .checked_mul(u128::from(units))
        .ok_or(Error::Overflow)?;
    let gross = round_half_up(num, den);
    let tax = round_half_up(
        gross
            .checked_mul(u128::from(tax_bps))
            .ok_or(Error::Overflow)?,
        BPS,
    );
    let net = gross.checked_sub(tax).ok_or(Error::Overflow)?;
    let full = u128::from(units) * u128::from(face); // u64 * u64 always fits u128
    let principal = match kind {
        Kind::Redemption | Kind::EarlyRedemption => full,
        Kind::PartialRedemption { factor_bps } => round_half_up(
            full.checked_mul(u128::from(factor_bps))
                .ok_or(Error::Overflow)?,
            BPS,
        ),
        Kind::Interest | Kind::Meeting | Kind::TermsChange => 0,
    };
    let to_u64 = |x: u128| u64::try_from(x).map_err(|_| Error::Overflow);
    Ok(Entitlement {
        gross: to_u64(gross)?,
        tax: to_u64(tax)?,
        net: to_u64(net)?,
        principal: to_u64(principal)?,
    })
}

/// Per-unit gross coupon, rounded half-up. Informational only (display, ISO export).
pub fn per_unit_gross(face: u64, rate_bps: u32, dc: DayCount, days: u32) -> Result<u64, Error> {
    let (num, den) = coupon_fraction(face, rate_bps, dc, days)?;
    u64::try_from(round_half_up(num, den)).map_err(|_| Error::Overflow)
}

/// Rounding-drift check for `finalize_snapshot`: true iff `|Σ gross − supply × exact per-unit coupon| ≤ holders / 2`.
///
/// Each holder's half-up rounding error lies in (−½, ½], so the sum of `holders` errors is bounded by `holders / 2`.
/// Compared against the *exact* fraction, not the rounded `per_unit_gross`: `supply × round(per_unit)` can drift
/// by up to `supply / 2` (e.g. MCAL 47 days: 10 units → 20,824 vs 10 × 2,082 = 20,820).
pub fn rounding_within_tolerance(
    sum_gross: u64,
    supply: u64,
    holders: u32,
    face: u64,
    rate_bps: u32,
    dc: DayCount,
    days: u32,
) -> Result<bool, Error> {
    let (per_unit_num, den) = coupon_fraction(face, rate_bps, dc, days)?;
    let exact = per_unit_num
        .checked_mul(u128::from(supply))
        .ok_or(Error::Overflow)?;
    let paid = u128::from(sum_gross)
        .checked_mul(den)
        .ok_or(Error::Overflow)?;
    let drift2 = paid.abs_diff(exact).checked_mul(2).ok_or(Error::Overflow)?;
    Ok(drift2 <= u128::from(holders) * den)
}
