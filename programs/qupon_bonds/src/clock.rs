//! Civil dates ↔ timestamps for a series: real = Almaty midnights; demo = `day_secs` per civil day (spec D7).
//! Thin wrapper over `entitlement::CivilClock` that speaks `QuponError` and reads a `Series`.
use anchor_lang::prelude::*;
use entitlement::{CivilClock, Ymd};

use crate::{
    constants::ALMATY_UTC_OFFSET_SECS,
    error::{math_err, QuponError},
    state::Series,
};

pub struct SeriesClock(pub CivilClock);

impl SeriesClock {
    /// `day_secs == 0` → the real Almaty clock; otherwise a demo clock anchored at the issue date.
    pub fn from_params(day_secs: u32, issue_date: i64, issue_ymd: u32) -> Result<Self> {
        if day_secs == 0 {
            return Ok(Self(CivilClock::real(ALMATY_UTC_OFFSET_SECS)));
        }
        let issue = Ymd::from_packed(issue_ymd).map_err(math_err)?;
        Ok(Self(
            CivilClock::demo(day_secs, issue_date, issue)
                .map_err(|_| error!(QuponError::InvalidParams))?,
        ))
    }
    /// The clock a series runs on (older series read `day_secs = 0` → real clock).
    pub fn of(s: &Series) -> Result<Self> {
        Self::from_params(s.day_secs, s.issue_date, s.issue_ymd)
    }
    /// Civil date of a midnight timestamp of this clock (error if it is not a midnight).
    pub fn civil(&self, ts: i64) -> Result<Ymd> {
        self.0
            .civil(ts)
            .map_err(|_| error!(QuponError::InvalidDates))
    }
    /// Midnight timestamp of a civil date.
    pub fn ts(&self, d: Ymd) -> Result<i64> {
        self.0.ts(d).map_err(math_err)
    }
    /// Midnight timestamp `m` months after the midnight `ts` (end-of-month clamped).
    pub fn add_months(&self, ts: i64, m: u32) -> Result<i64> {
        self.0.add_months(ts, m).map_err(math_err)
    }
    /// True iff `ts` is a midnight of this clock.
    pub fn is_midnight(&self, ts: i64) -> bool {
        self.0.is_midnight(ts)
    }
    /// One series day in seconds (default/cure window, D4; also the record-date lead).
    pub fn grace(&self) -> i64 {
        self.0.day_secs
    }
    /// True when this series runs on compressed days (labelled DEMO everywhere).
    pub fn is_demo(&self) -> bool {
        self.0.is_demo()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Almaty midnight of a civil date, built independently of the clock.
    fn almaty(y: u16, m: u8, d: u8) -> i64 {
        Ymd::new(y, m, d).unwrap().days_from_epoch() * 86_400 - ALMATY_UTC_OFFSET_SECS
    }

    /// The real clock must behave exactly like the pre-refactor Almaty helpers (cases moved from init_series.rs).
    #[test]
    fn real_clock_keeps_almaty_midnight_and_clamps() {
        let clock = SeriesClock::from_params(0, 0, 0).unwrap();
        assert!(!clock.is_demo());
        assert_eq!(clock.grace(), 86_400);
        assert_eq!(almaty(2026, 7, 3), 1_783_018_800);
        for ((y, m, d), months, (y2, m2, d2)) in [
            ((2026, 7, 3), 6, (2027, 1, 3)),
            ((2026, 8, 31), 6, (2027, 2, 28)), // UTC date is Aug 30 — offset must be applied
            ((2027, 8, 31), 6, (2028, 2, 29)),
            ((2026, 1, 31), 1, (2026, 2, 28)),
            ((2026, 12, 31), 3, (2027, 3, 31)),
            ((2026, 3, 1), 1, (2026, 4, 1)), // UTC date is Feb 28
        ] {
            let ts = almaty(y, m, d);
            let got = clock.add_months(ts, months).unwrap();
            assert_eq!(got, almaty(y2, m2, d2), "{y}-{m}-{d} + {months}");
            assert!(clock.is_midnight(got));
            assert_eq!(
                clock.civil(ts).unwrap(),
                Ymd::new(y, m, d).unwrap(),
                "civil date of an Almaty midnight"
            );
        }
        assert!(!clock.is_midnight(almaty(2026, 7, 3) + 3600));
        assert!(clock.civil(almaty(2026, 7, 3) + 3600).is_err());
    }

    #[test]
    fn demo_clock_maps_civil_dates_to_anchor_plus_days() {
        // fixtures/entitlement.json demo_1s_issue / demo_1s_maturity.
        let clock = SeriesClock::from_params(1, 1_791_000_000, 20_261_009).unwrap();
        assert!(clock.is_demo());
        assert_eq!(clock.grace(), 1);
        assert_eq!(
            clock.ts(Ymd::new(2026, 10, 9).unwrap()).unwrap(),
            1_791_000_000
        );
        assert_eq!(
            clock.ts(Ymd::new(2027, 10, 9).unwrap()).unwrap(),
            1_791_000_365
        );
        assert_eq!(clock.add_months(1_791_000_000, 6).unwrap(), 1_791_000_182);
        // day_secs = 1: every second is a boundary; on a 2 s clock only even offsets are midnights.
        let two = SeriesClock::from_params(2, 1_791_000_000, 20_260_831).unwrap();
        assert!(two.is_midnight(1_791_000_046));
        assert!(!two.is_midnight(1_791_000_045));
        assert_eq!(
            two.add_months(1_791_000_000, 6).unwrap(),
            1_791_000_000 + 2 * 181
        ); // demo_2s_eom: 2026-08-31 → 2027-02-28 = 181 days
    }

    #[test]
    fn demo_clock_bounds() {
        assert!(SeriesClock::from_params(86_400, 0, 20_261_009).is_err());
        assert!(SeriesClock::from_params(1, 0, 20_261_009).is_ok()); // any anchor timestamp is valid
    }

    /// `SeriesClock::of` reads the same clock back out of a stored series (an all-zero account is a valid
    /// legacy series: day_secs 0 → real clock).
    #[test]
    fn of_round_trips_a_stored_series() {
        use anchor_lang::{AccountDeserialize, Discriminator};
        let mut buf = Series::DISCRIMINATOR.to_vec();
        buf.extend_from_slice(&[0u8; Series::INIT_SPACE]);
        let mut s: Series = Series::try_deserialize(&mut buf.as_slice()).unwrap();
        for (day_secs, issue_date, issue_ymd) in [
            (0u32, almaty(2026, 7, 3), 0u32),
            (2, 1_791_000_000, 20_260_831),
        ] {
            s.day_secs = day_secs;
            s.issue_date = issue_date;
            s.issue_ymd = issue_ymd;
            let clock = SeriesClock::of(&s).unwrap();
            assert!(clock.is_midnight(issue_date));
            assert_eq!(clock.0.day_secs, if day_secs == 0 { 86_400 } else { 2 });
        }
    }
}
