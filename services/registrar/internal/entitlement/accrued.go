// Civil clock and signed accrued interest, mirroring the crate's
// entitlement::CivilClock and accrued_signed (plan 15 D7; docs/03-domain.md §2).
// The contract is fixtures/entitlement.json clock_cases/accrued_cases; the
// Rust crate and the TS client implement the same math bit-for-bit.
package entitlement

import "math"

// RealClockDaySecs is the length of one civil day on the real clock.
const RealClockDaySecs int64 = 86_400

// CivilClock maps civil dates to timestamps. Real: Almaty midnights (day =
// 86 400 s, offset from UTC). Demo: DaySecs seconds per civil day counted
// from the issue timestamp, so a whole bond life fits in minutes with the
// same civil-day math.
type CivilClock struct {
	DaySecs    int64 // length of one civil day in seconds (86 400 = real clock)
	AnchorTs   int64 // timestamp of the AnchorDays civil date's midnight
	AnchorDays int64 // days since 1970-01-01 of the anchor civil date
}

// CivilClockReal returns the real clock for a UTC offset in seconds
// (Asia/Almaty = 5 × 3600).
func CivilClockReal(utcOffsetSecs int64) CivilClock {
	return CivilClock{DaySecs: RealClockDaySecs, AnchorTs: -utcOffsetSecs, AnchorDays: 0}
}

// CivilClockDemo returns a demo clock: daySecs seconds per civil day,
// anchored at the issue timestamp. 0 and >= 86 400 are rejected like the crate.
func CivilClockDemo(daySecs uint32, issueTs int64, issue YMD) (CivilClock, error) {
	if daySecs == 0 || int64(daySecs) >= RealClockDaySecs {
		return CivilClock{}, ErrInvalidPeriod
	}
	return CivilClock{DaySecs: int64(daySecs), AnchorTs: issueTs, AnchorDays: issue.DaysFromEpoch()}, nil
}

// IsDemo reports whether this clock runs on compressed days.
func (c CivilClock) IsDemo() bool { return c.DaySecs != RealClockDaySecs }

// IsMidnight reports whether ts is a midnight of this clock.
func (c CivilClock) IsMidnight(ts int64) bool {
	d := ts - c.AnchorTs
	return ((d%c.DaySecs)+c.DaySecs)%c.DaySecs == 0 // rem_euclid
}

// Civil returns the civil date of a midnight timestamp (ErrInvalidDate if ts
// is not a midnight of this clock).
func (c CivilClock) Civil(ts int64) (YMD, error) {
	if !c.IsMidnight(ts) {
		return YMD{}, ErrInvalidDate
	}
	return c.FloorCivil(ts)
}

// FloorCivil returns the civil date containing ts (any time of day).
func (c CivilClock) FloorCivil(ts int64) (YMD, error) {
	d := floorDiv(ts-c.AnchorTs, c.DaySecs)
	days, ok := addI64(c.AnchorDays, d)
	if !ok {
		return YMD{}, ErrOverflow
	}
	return YMDFromDays(days)
}

// Ts returns the midnight timestamp of civil date d.
func (c CivilClock) Ts(d YMD) (int64, error) {
	n := d.DaysFromEpoch() - c.AnchorDays // both small: cannot overflow
	p, ok := mulI64(n, c.DaySecs)
	if !ok {
		return 0, ErrOverflow
	}
	s, ok := addI64(p, c.AnchorTs)
	if !ok {
		return 0, ErrOverflow
	}
	return s, nil
}

// AddMonths returns the midnight timestamp months months after the midnight
// ts (clamped to the month's last day).
func (c CivilClock) AddMonths(ts int64, months uint32) (int64, error) {
	d, err := c.Civil(ts)
	if err != nil {
		return 0, err
	}
	next, err := d.AddMonths(months)
	if err != nil {
		return 0, err
	}
	return c.Ts(next)
}

// YMDFromDays returns the civil date of days since 1970-01-01 — mirrors
// Ymd::from_days.
func YMDFromDays(days int64) (YMD, error) {
	ts, ok := mulI64(days, 86_400)
	if !ok {
		return YMD{}, ErrOverflow
	}
	return YMDFromUnixUTC(ts)
}

// AccruedSigned returns the accrued interest for units from start to settle
// (negative when settle precedes start: the ex-coupon window), with the
// signed accrual days. Half-up on the magnitude, once per position — the
// same convention as coupons (docs/03-domain.md §2).
func AccruedSigned(units, face uint64, rateBps uint32, dc DayCount, start, settle YMD) (int64, int32, error) {
	a, b, sign := start, settle, int64(1)
	if ymdLess(settle, start) {
		a, b, sign = settle, start, -1
	}
	var days uint32
	if a != b {
		d, err := AccrualDays(dc, a, b)
		if err != nil {
			return 0, 0, err
		}
		days = d
	}
	num, ok := u128From64(units).mul64(face)
	if ok {
		num, ok = num.mul64(uint64(rateBps))
	}
	if ok {
		num, ok = num.mul64(uint64(days))
	}
	if !ok {
		return 0, 0, ErrOverflow
	}
	basis, err := dc.Basis()
	if err != nil {
		return 0, 0, err
	}
	amount, ok := roundHalfUp(num, BPS*uint64(basis))
	if !ok {
		return 0, 0, ErrOverflow
	}
	q, err := amount.toU64()
	if err != nil {
		return 0, 0, err
	}
	if q > math.MaxInt64 || days > math.MaxInt32 {
		return 0, 0, ErrOverflow
	}
	return sign * int64(q), int32(sign) * int32(days), nil
}

// ymdLess is the chronological order of two civil dates (mirrors derive(Ord)).
func ymdLess(a, b YMD) bool {
	switch {
	case a.Y != b.Y:
		return a.Y < b.Y
	case a.M != b.M:
		return a.M < b.M
	default:
		return a.D < b.D
	}
}

func addI64(a, b int64) (int64, bool) {
	s := a + b
	return s, (b >= 0 && s >= a) || (b < 0 && s < a)
}

func mulI64(a, b int64) (int64, bool) {
	if a == 0 || b == 0 {
		return 0, true
	}
	p := a * b
	return p, p/b == a
}
