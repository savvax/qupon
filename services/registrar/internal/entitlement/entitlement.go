// Package entitlement mirrors crates/entitlement bit-for-bit: day counts,
// per-holder half-up rounding, and gross/tax/net/principal in integer minor
// units of the settlement currency. The contract is fixtures/entitlement.json;
// the rules are docs/03-domain.md §2–§3. The registrar uses it to pre-compute
// and reconcile payments; the on-chain program enforces the same math.
package entitlement

import (
	"errors"
	"math"
	"math/bits"
)

// BPS is the basis-point denominator (100% = 10_000 bps).
const BPS = 10_000

// Errors mirroring the Rust crate's Error enum; the program maps these onto
// its own error codes.
var (
	// ErrOverflow: an intermediate or final value does not fit the target integer type.
	ErrOverflow = errors.New("entitlement: value does not fit the target integer type")
	// ErrUnsupportedDayCount: convention not implemented (ACT/ACT is reserved, never faked).
	ErrUnsupportedDayCount = errors.New("entitlement: unsupported day count")
	// ErrInvalidDate: not a valid civil date (or year outside uint16).
	ErrInvalidDate = errors.New("entitlement: invalid date")
	// ErrInvalidPeriod: period end precedes period start.
	ErrInvalidPeriod = errors.New("entitlement: invalid period")
	// ErrInvalidCode: unknown enum code.
	ErrInvalidCode = errors.New("entitlement: invalid code")
)

// DayCount is the day count convention; codes match Series.day_count on-chain.
type DayCount uint8

const (
	Thirty360 DayCount = 0 // 30E/360 (default), basis 360
	ActAct    DayCount = 1 // reserved, rejected with ErrUnsupportedDayCount
	Act365    DayCount = 2 // actual days / 365, basis 365
)

// DayCountFromCode decodes the on-chain day_count code.
func DayCountFromCode(v uint8) (DayCount, error) {
	switch v {
	case uint8(Thirty360), uint8(ActAct), uint8(Act365):
		return DayCount(v), nil
	default:
		return 0, ErrInvalidCode
	}
}

// Basis is the year basis used as the coupon denominator.
func (dc DayCount) Basis() (uint32, error) {
	switch dc {
	case Thirty360:
		return 360, nil
	case Act365:
		return 365, nil
	case ActAct:
		return 0, ErrUnsupportedDayCount
	default:
		return 0, ErrInvalidCode
	}
}

// Kind is the corporate action kind; codes match CorporateAction.kind on-chain.
type Kind uint8

const (
	KindInterest          Kind = 0 // INTR — coupon payment
	KindRedemption        Kind = 1 // REDM — principal + final coupon
	KindEarlyRedemption   Kind = 2 // MCAL — principal + accrued coupon
	KindPartialRedemption Kind = 3 // PCAL — factor_bps of face + coupon
	KindMeeting           Kind = 4 // BMET — bondholder meeting (no cash)
	KindTermsChange       Kind = 5 // CHAN — terms change (no cash)
)

// KindFromCode decodes the on-chain kind code.
func KindFromCode(code uint8) (Kind, error) {
	if code <= uint8(KindTermsChange) {
		return Kind(code), nil
	}
	return 0, ErrInvalidCode
}

// YMD is a civil (calendar) date in UTC; mirrors the Rust Ymd.
type YMD struct {
	Y uint16
	M uint8 // 1–12
	D uint8 // 1–31
}

func isLeap(y int64) bool {
	return (y%4 == 0 && y%100 != 0) || y%400 == 0
}

func daysInMonth(y int64, m uint8) uint8 {
	switch m {
	case 4, 6, 9, 11:
		return 30
	case 2:
		if isLeap(y) {
			return 29
		}
		return 28
	default:
		return 31
	}
}

// NewYMD validates and builds a civil date.
func NewYMD(y uint16, m, d uint8) (YMD, error) {
	if m < 1 || m > 12 || d == 0 || d > daysInMonth(int64(y), m) {
		return YMD{}, ErrInvalidDate
	}
	return YMD{Y: y, M: m, D: d}, nil
}

// YMDFromPacked parses yyyymmdd (e.g. 20260703), as passed to announce_action.
func YMDFromPacked(v uint32) (YMD, error) {
	if v/10_000 > math.MaxUint16 {
		return YMD{}, ErrInvalidDate
	}
	return NewYMD(uint16(v/10_000), uint8(v/100%100), uint8(v%100))
}

// floorDiv is Rust's div_euclid (Go's / truncates toward zero; we need the
// floor for pre-1970 timestamps and pre-year-400 eras).
func floorDiv(a, b int64) int64 {
	q := a / b
	if a%b != 0 && (a < 0) != (b < 0) {
		q--
	}
	return q
}

// YMDFromUnixUTC returns the civil date (UTC) of a unix timestamp — Howard
// Hinnant's civil_from_days, matching the Rust crate bit-for-bit.
func YMDFromUnixUTC(ts int64) (YMD, error) {
	z := floorDiv(ts, 86_400) + 719_468
	era := floorDiv(z, 146_097)
	doe := z - era*146_097                                    // [0, 146096]
	yoe := (doe - doe/1_460 + doe/36_524 - doe/146_096) / 365 // [0, 399]
	doy := doe - (365*yoe + yoe/4 - yoe/100)                  // [0, 365]
	mp := (5*doy + 2) / 153                                   // [0, 11]
	d := doy - (153*mp+2)/5 + 1                               // [1, 31]
	m := mp + 3
	if mp >= 10 {
		m = mp - 9
	}
	y := yoe + era*400
	if m <= 2 {
		y++
	}
	if y < 0 || y > math.MaxUint16 {
		return YMD{}, ErrInvalidDate
	}
	return YMD{Y: uint16(y), M: uint8(m), D: uint8(d)}, nil
}

// AddMonths returns the same day months later, clamped to the month's last
// day (Jan 31 + 1 → Feb 28/29). Coupon schedule step.
func (d YMD) AddMonths(months uint32) (YMD, error) {
	total := int64(d.Y)*12 + int64(d.M) - 1 + int64(months)
	y, m := total/12, total%12+1
	if y < 0 || y > math.MaxUint16 {
		return YMD{}, ErrInvalidDate
	}
	day := min(int64(d.D), int64(daysInMonth(y, uint8(m))))
	return YMD{Y: uint16(y), M: uint8(m), D: uint8(day)}, nil
}

// DaysFromEpoch returns days since 1970-01-01 — Hinnant's days_from_civil.
func (d YMD) DaysFromEpoch() int64 {
	m := int64(d.M)
	y := int64(d.Y)
	if m <= 2 {
		y--
	}
	era := floorDiv(y, 400)
	yoe := y - era*400 // [0, 399]
	mp := m + 9
	if m > 2 {
		mp = m - 3
	}
	doy := (153*mp+2)/5 + int64(d.D) - 1   // [0, 365]
	doe := yoe*365 + yoe/4 - yoe/100 + doy // [0, 146096]
	return era*146_097 + doe - 719_468
}

// AccrualDays returns the accrual days between two civil dates under the
// given convention (docs/03-domain.md §3).
func AccrualDays(dc DayCount, start, end YMD) (uint32, error) {
	var days int64
	switch dc {
	case Thirty360:
		d1 := min(int64(start.D), 30)
		d2 := min(int64(end.D), 30)
		days = 360*(int64(end.Y)-int64(start.Y)) + 30*(int64(end.M)-int64(start.M)) + (d2 - d1)
	case Act365:
		days = end.DaysFromEpoch() - start.DaysFromEpoch()
	case ActAct:
		return 0, ErrUnsupportedDayCount
	default:
		return 0, ErrInvalidCode
	}
	if days < 0 || days > math.MaxUint32 {
		return 0, ErrInvalidPeriod
	}
	return uint32(days), nil
}

// u128 emulates the Rust crate's u128 intermediates with the same checked
// semantics: every operation reports whether the mathematical result fits.
type u128 struct{ hi, lo uint64 }

func u128From64(v uint64) u128 { return u128{lo: v} }

// mul64 multiplies by a 64-bit factor, reporting whether the result fits 128 bits.
func (a u128) mul64(b uint64) (u128, bool) {
	tHi, tLo := bits.Mul64(a.hi, b)
	if tHi != 0 {
		return u128{}, false
	}
	uHi, uLo := bits.Mul64(a.lo, b)
	hi, carry := bits.Add64(tLo, uHi, 0)
	return u128{hi: hi, lo: uLo}, carry == 0
}

func (a u128) inc() (u128, bool) {
	lo, carry := bits.Add64(a.lo, 1, 0)
	if carry == 0 {
		return u128{hi: a.hi, lo: lo}, true
	}
	if a.hi == math.MaxUint64 {
		return u128{}, false
	}
	return u128{hi: a.hi + 1, lo: lo}, true
}

func (a u128) cmp(b u128) int {
	switch {
	case a.hi != b.hi:
		if a.hi < b.hi {
			return -1
		}
		return 1
	case a.lo != b.lo:
		if a.lo < b.lo {
			return -1
		}
		return 1
	default:
		return 0
	}
}

// sub returns a-b, reporting whether a >= b.
func (a u128) sub(b u128) (u128, bool) {
	if a.cmp(b) < 0 {
		return u128{}, false
	}
	lo, borrow := bits.Sub64(a.lo, b.lo, 0)
	hi, _ := bits.Sub64(a.hi, b.hi, borrow)
	return u128{hi: hi, lo: lo}, true
}

// shl1 doubles a, reporting overflow past 128 bits.
func (a u128) shl1() (u128, bool) {
	if a.hi>>63 != 0 {
		return u128{}, false
	}
	return u128{hi: a.hi<<1 | a.lo>>63, lo: a.lo << 1}, true
}

// divmod64 divides by a non-zero 64-bit den; all call sites pass den >= BPS.
func (a u128) divmod64(d uint64) (u128, uint64) {
	qHi := a.hi / d
	r := a.hi % d
	qLo, rem := bits.Div64(r, a.lo, d) // requires r < d, guaranteed here
	return u128{hi: qHi, lo: qLo}, rem
}

func (a u128) toU64() (uint64, error) {
	if a.hi != 0 {
		return 0, ErrOverflow
	}
	return a.lo, nil
}

// roundHalfUp returns num/den rounded half-up (ties away from zero); den must
// be non-zero. Mirrors the Rust round_half_up: 2r >= den <=> r >= den - r.
func roundHalfUp(num u128, den uint64) (u128, bool) {
	q, r := num.divmod64(den)
	if r >= den-r {
		return q.inc()
	}
	return q, true
}

// Entitlement is one holder's entitlement in minor units of the settlement
// currency.
type Entitlement struct {
	Gross     uint64 // coupon before tax
	Tax       uint64 // withheld tax (goes to the tax vault)
	Net       uint64 // Gross - Tax
	Principal uint64 // principal repaid (0 for coupons)
}

// Payout is what pay_batch transfers to the holder: Net + Principal.
func (e Entitlement) Payout() (uint64, error) {
	p := e.Net + e.Principal
	if p < e.Net {
		return 0, ErrOverflow
	}
	return p, nil
}

// couponFraction returns face*rate_bps*days and 10_000*basis: the exact
// per-unit coupon as a fraction. Overflow is checked before the basis error,
// mirroring the Rust evaluation order.
func couponFraction(face uint64, rateBps uint32, dc DayCount, days uint32) (u128, uint64, error) {
	num, ok := u128From64(face).mul64(uint64(rateBps))
	if ok {
		num, ok = num.mul64(uint64(days))
	}
	if !ok {
		return u128{}, 0, ErrOverflow
	}
	basis, err := dc.Basis()
	if err != nil {
		return u128{}, 0, err
	}
	return num, BPS * uint64(basis), nil
}

// Compute returns one holder's entitlement (docs/03-domain.md §2). Rounding
// is per holder, never per unit then multiplied. factorBps applies only to
// KindPartialRedemption (share of face redeemed, 10_000 = full).
func Compute(units, face uint64, rateBps uint32, dc DayCount, days uint32, taxBps uint16, kind Kind, factorBps uint16) (Entitlement, error) {
	perUnitNum, den, err := couponFraction(face, rateBps, dc, days)
	if err != nil {
		return Entitlement{}, err
	}
	num, ok := perUnitNum.mul64(units)
	if !ok {
		return Entitlement{}, ErrOverflow
	}
	gross, ok := roundHalfUp(num, den)
	if !ok {
		return Entitlement{}, ErrOverflow
	}
	taxed, ok := gross.mul64(uint64(taxBps))
	if !ok {
		return Entitlement{}, ErrOverflow
	}
	tax, ok := roundHalfUp(taxed, BPS)
	if !ok {
		return Entitlement{}, ErrOverflow
	}
	net, ok := gross.sub(tax)
	if !ok {
		return Entitlement{}, ErrOverflow
	}
	full, _ := u128From64(units).mul64(face) // u64 * u64 always fits u128
	var principal u128
	switch kind {
	case KindRedemption, KindEarlyRedemption:
		principal = full
	case KindPartialRedemption:
		p, ok := full.mul64(uint64(factorBps))
		if !ok {
			return Entitlement{}, ErrOverflow
		}
		principal, ok = roundHalfUp(p, BPS)
		if !ok {
			return Entitlement{}, ErrOverflow
		}
	case KindInterest, KindMeeting, KindTermsChange:
		// No principal.
	default:
		return Entitlement{}, ErrInvalidCode
	}
	e := Entitlement{}
	if e.Gross, err = gross.toU64(); err != nil {
		return Entitlement{}, err
	}
	if e.Tax, err = tax.toU64(); err != nil {
		return Entitlement{}, err
	}
	if e.Net, err = net.toU64(); err != nil {
		return Entitlement{}, err
	}
	if e.Principal, err = principal.toU64(); err != nil {
		return Entitlement{}, err
	}
	return e, nil
}

// PerUnitGross is the per-unit gross coupon, rounded half-up. Informational
// only (display, ISO export) — reconciliation uses the exact fraction.
func PerUnitGross(face uint64, rateBps uint32, dc DayCount, days uint32) (uint64, error) {
	num, den, err := couponFraction(face, rateBps, dc, days)
	if err != nil {
		return 0, err
	}
	q, ok := roundHalfUp(num, den)
	if !ok {
		return 0, ErrOverflow
	}
	return q.toU64()
}

// RoundingWithinTolerance is the drift check for finalize_snapshot: true iff
// |Σ gross − supply × exact per-unit coupon| ≤ holders / 2. Each holder's
// half-up error lies in (−½, ½]; the comparison uses the exact fraction, never
// the rounded PerUnitGross (docs/03-domain.md §2).
func RoundingWithinTolerance(sumGross, supply uint64, holders uint32, face uint64, rateBps uint32, dc DayCount, days uint32) (bool, error) {
	perUnitNum, den, err := couponFraction(face, rateBps, dc, days)
	if err != nil {
		return false, err
	}
	exact, ok := perUnitNum.mul64(supply)
	if !ok {
		return false, ErrOverflow
	}
	paid, ok := u128From64(sumGross).mul64(den)
	if !ok {
		return false, ErrOverflow
	}
	hi, lo := paid, exact
	if lo.cmp(hi) > 0 {
		hi, lo = lo, hi
	}
	diff, _ := hi.sub(lo)
	drift2, ok := diff.shl1()
	if !ok {
		return false, ErrOverflow
	}
	limit, _ := u128From64(uint64(holders)).mul64(den) // holders ≤ 2^32, den ≤ 3.65e6: fits
	return drift2.cmp(limit) <= 0, nil
}
