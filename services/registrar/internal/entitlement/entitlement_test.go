package entitlement

import (
	"encoding/json"
	"math"
	"math/rand"
	"os"
	"strconv"
	"strings"
	"testing"
)

// Shared contract with the Rust crate and the on-chain tests.
const fixturePath = "../../../../fixtures/entitlement.json"

type fixtures struct {
	DayCountCases []dayCase `json:"day_count_cases"`
	Cases         []entCase `json:"cases"`
	TotalsCheck   totals    `json:"totals_check"`
}

type dayCase struct {
	ID       string `json:"id"`
	DayCount string `json:"day_count"`
	Start    string `json:"start"`
	End      string `json:"end"`
	Days     uint32 `json:"days"`
}

type entCase struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Units     uint64 `json:"units"`
	Face      uint64 `json:"face"`
	RateBps   uint32 `json:"rate_bps"`
	DayCount  string `json:"day_count"`
	Days      uint32 `json:"days"`
	TaxBps    uint16 `json:"tax_bps"`
	Gross     uint64 `json:"gross"`
	Tax       uint64 `json:"tax"`
	Net       uint64 `json:"net"`
	Principal uint64 `json:"principal"`
}

type totals struct {
	Supply          uint64 `json:"supply"`
	PerUnitGross    uint64 `json:"per_unit_gross"`
	SumGross        uint64 `json:"sum_gross"`
	MaxDriftAllowed uint64 `json:"max_drift_allowed"`
}

func loadFixtures(t *testing.T) fixtures {
	t.Helper()
	b, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read %s: %v", fixturePath, err)
	}
	var f fixtures
	if err := json.Unmarshal(b, &f); err != nil {
		t.Fatalf("parse %s: %v", fixturePath, err)
	}
	return f
}

func dayCount(t *testing.T, s string) DayCount {
	t.Helper()
	switch s {
	case "THIRTY_360":
		return Thirty360
	case "ACT_365":
		return Act365
	default:
		t.Fatalf("unknown day_count %q", s)
		return 0
	}
}

func kind(t *testing.T, s string) Kind {
	t.Helper()
	switch s {
	case "INTR":
		return KindInterest
	case "REDM":
		return KindRedemption
	case "MCAL":
		return KindEarlyRedemption
	default:
		t.Fatalf("unknown kind %q", s)
		return 0
	}
}

func ymd(t *testing.T, s string) YMD {
	t.Helper()
	v, err := strconv.ParseUint(strings.ReplaceAll(s, "-", ""), 10, 32)
	if err != nil {
		t.Fatalf("parse date %q: %v", s, err)
	}
	d, err := YMDFromPacked(uint32(v))
	if err != nil {
		t.Fatalf("date %q: %v", s, err)
	}
	return d
}

func TestDayCountCases(t *testing.T) {
	for _, c := range loadFixtures(t).DayCountCases {
		t.Run(c.ID, func(t *testing.T) {
			got, err := AccrualDays(dayCount(t, c.DayCount), ymd(t, c.Start), ymd(t, c.End))
			if err != nil {
				t.Fatalf("accrual_days: %v", err)
			}
			if got != c.Days {
				t.Errorf("accrual_days(%s → %s) = %d, want %d", c.Start, c.End, got, c.Days)
			}
		})
	}
}

func TestEntitlementCases(t *testing.T) {
	for _, c := range loadFixtures(t).Cases {
		t.Run(c.ID, func(t *testing.T) {
			e, err := Compute(c.Units, c.Face, c.RateBps, dayCount(t, c.DayCount), c.Days, c.TaxBps, kind(t, c.Kind), 0)
			if err != nil {
				t.Fatalf("compute: %v", err)
			}
			if e.Gross != c.Gross || e.Tax != c.Tax || e.Net != c.Net || e.Principal != c.Principal {
				t.Errorf("got (gross=%d, tax=%d, net=%d, principal=%d), want (%d, %d, %d, %d)",
					e.Gross, e.Tax, e.Net, e.Principal, c.Gross, c.Tax, c.Net, c.Principal)
			}
		})
	}
}

func TestTotalsCheck(t *testing.T) {
	f := loadFixtures(t)
	tc := f.TotalsCheck
	pu, err := PerUnitGross(100_000, 1000, Thirty360, 180)
	if err != nil {
		t.Fatalf("per_unit_gross: %v", err)
	}
	if pu != tc.PerUnitGross {
		t.Errorf("per_unit_gross = %d, want %d", pu, tc.PerUnitGross)
	}
	var sum uint64
	for _, c := range f.Cases {
		if strings.HasPrefix(c.ID, "brief_coupon_") {
			sum += c.Gross
		}
	}
	if sum != tc.SumGross {
		t.Errorf("Σ brief gross = %d, want %d", sum, tc.SumGross)
	}
	if diff := sum - tc.Supply*pu; diff > tc.MaxDriftAllowed {
		t.Errorf("drift %d > %d", diff, tc.MaxDriftAllowed)
	}
	ok, err := RoundingWithinTolerance(sum, tc.Supply, 3, 100_000, 1000, Thirty360, 180)
	if err != nil || !ok {
		t.Errorf("rounding_within_tolerance = (%v, %v), want (true, nil)", ok, err)
	}
}

func TestHalfUpNotBankers(t *testing.T) {
	for _, tc := range []struct {
		num, den, want uint64
	}{
		{1, 2, 1},
		{5, 2, 3},
		{4, 3, 1},
		{5, 3, 2},
		{0, 7, 0},
	} {
		got, ok := roundHalfUp(u128From64(tc.num), tc.den)
		if !ok {
			t.Fatalf("round_half_up(%d, %d): overflow", tc.num, tc.den)
		}
		if got.lo != tc.want || got.hi != 0 {
			t.Errorf("round_half_up(%d, %d) = %d, want %d", tc.num, tc.den, got.lo, tc.want)
		}
	}
}

func TestMcalDriftVsRoundedPerUnit(t *testing.T) {
	// 10 units, 47 days: holder gross 20,824 but 10 × per_unit (2,082) = 20,820 — must still pass.
	ok, err := RoundingWithinTolerance(20_824, 10, 1, 100_000, 1595, Thirty360, 47)
	if err != nil || !ok {
		t.Errorf("tolerance(20824) = (%v, %v), want (true, nil)", ok, err)
	}
	ok, err = RoundingWithinTolerance(20_826, 10, 1, 100_000, 1595, Thirty360, 47)
	if err != nil || ok {
		t.Errorf("tolerance(20826) = (%v, %v), want (false, nil)", ok, err)
	}
}

func TestErrors(t *testing.T) {
	d := ymd(t, "2026-07-03")
	if _, err := AccrualDays(ActAct, d, d); err != ErrUnsupportedDayCount {
		t.Errorf("ActAct: got %v, want %v", err, ErrUnsupportedDayCount)
	}
	if _, err := AccrualDays(Thirty360, ymd(t, "2027-01-03"), d); err != ErrInvalidPeriod {
		t.Errorf("end < start: got %v, want %v", err, ErrInvalidPeriod)
	}
	for _, packed := range []uint32{20260230, 20261301} {
		if _, err := YMDFromPacked(packed); err != ErrInvalidDate {
			t.Errorf("YMDFromPacked(%d): got %v, want %v", packed, err, ErrInvalidDate)
		}
	}
	if _, err := Compute(math.MaxUint64, math.MaxUint64, math.MaxUint32, Thirty360, 180, 0, KindInterest, 0); err != ErrOverflow {
		t.Errorf("max values: got %v, want %v", err, ErrOverflow)
	}
	if _, err := DayCountFromCode(3); err != ErrInvalidCode {
		t.Errorf("DayCountFromCode(3): got %v, want %v", err, ErrInvalidCode)
	}
	if _, err := KindFromCode(6); err != ErrInvalidCode {
		t.Errorf("KindFromCode(6): got %v, want %v", err, ErrInvalidCode)
	}
	// Go-only guards: raw codes cannot be invalid in the Rust enum, but uint8 can be.
	if _, err := Compute(1, 100_000, 1000, DayCount(9), 180, 0, KindInterest, 0); err != ErrInvalidCode {
		t.Errorf("day_count 9: got %v, want %v", err, ErrInvalidCode)
	}
	if _, err := Compute(1, 100_000, 1000, Thirty360, 180, 0, Kind(6), 0); err != ErrInvalidCode {
		t.Errorf("kind 6: got %v, want %v", err, ErrInvalidCode)
	}
	if _, err := Compute(10, 100_000, 1000, Thirty360, 180, 65535, KindInterest, 0); err != ErrOverflow {
		t.Errorf("tax > gross: got %v, want %v", err, ErrOverflow)
	}
}

func TestPartialRedemptionFactor(t *testing.T) {
	e, err := Compute(10, 100_000, 1000, Thirty360, 180, 0, KindPartialRedemption, 2500)
	if err != nil {
		t.Fatalf("compute: %v", err)
	}
	payout, err := e.Payout()
	if err != nil {
		t.Fatalf("payout: %v", err)
	}
	if e.Gross != 50_000 || e.Principal != 250_000 || payout != 300_000 {
		t.Errorf("got (gross=%d, principal=%d, payout=%d), want (50000, 250000, 300000)",
			e.Gross, e.Principal, payout)
	}
}

func TestUnixDates(t *testing.T) {
	for _, tc := range []struct {
		ts   int64
		want YMD
	}{
		{0, YMD{Y: 1970, M: 1, D: 1}},
		// 2026-07-03 00:00 Asia/Almaty = 2026-07-02 19:00 UTC → UTC civil date is the previous day (§3).
		{1_783_018_800, YMD{Y: 2026, M: 7, D: 2}},
		{-1, YMD{Y: 1969, M: 12, D: 31}},
	} {
		got, err := YMDFromUnixUTC(tc.ts)
		if err != nil {
			t.Fatalf("YMDFromUnixUTC(%d): %v", tc.ts, err)
		}
		if got != tc.want {
			t.Errorf("YMDFromUnixUTC(%d) = %+v, want %+v", tc.ts, got, tc.want)
		}
	}
}

func TestAddMonthsSchedule(t *testing.T) {
	for _, tc := range []struct {
		from, to string
		months   uint32
	}{
		{"2026-07-03", "2027-01-03", 6},
		{"2026-01-31", "2026-02-28", 1},
		{"2028-01-31", "2028-02-29", 1},
		{"2026-11-15", "2027-02-15", 3},
		{"2026-07-03", "2028-07-03", 24},
	} {
		got, err := ymd(t, tc.from).AddMonths(tc.months)
		if err != nil {
			t.Fatalf("AddMonths(%s, %d): %v", tc.from, tc.months, err)
		}
		if want := ymd(t, tc.to); got != want {
			t.Errorf("AddMonths(%s, %d) = %s, want %s", tc.from, tc.months, gotFormat(got), tc.to)
		}
	}
}

func gotFormat(d YMD) string {
	return strconv.Itoa(int(d.Y)) + "-" + strconv.Itoa(int(d.M)) + "-" + strconv.Itoa(int(d.D))
}

// Mirrors the Rust proptest civil_roundtrip over the full range with a step.
func TestCivilRoundtrip(t *testing.T) {
	for days := int64(-719_000); days <= 2_000_000; days += 977 {
		d, err := YMDFromUnixUTC(days * 86_400)
		if err != nil {
			t.Fatalf("YMDFromUnixUTC(%d): %v", days, err)
		}
		if got := d.DaysFromEpoch(); got != days {
			t.Fatalf("DaysFromEpoch(%+v) = %d, want %d", d, got, days)
		}
		if redone, err := NewYMD(d.Y, d.M, d.D); err != nil || redone != d {
			t.Fatalf("NewYMD(%+v) = (%+v, %v)", d, redone, err)
		}
	}
}

// Mirrors the Rust proptest sum_of_holders_within_tolerance: Σ holders' gross
// stays within holders/2 of supply × the exact per-unit coupon.
func TestSumOfHoldersWithinTolerance(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	for iter := 0; iter < 200; iter++ {
		holdings := make([]uint64, rng.Intn(39)+1)
		var sum, supply uint64
		holders := 0
		face := rng.Uint64()%10_000_000_000 + 1
		rateBps := rng.Uint32() % 5_000
		days := rng.Uint32() % 400
		for i := range holdings {
			holdings[i] = rng.Uint64() % 1_000_000
			e, err := Compute(holdings[i], face, rateBps, Thirty360, days, 0, KindInterest, 0)
			if err != nil {
				t.Fatalf("compute(holder %d): %v", i, err)
			}
			sum += e.Gross
			supply += holdings[i]
			if holdings[i] > 0 {
				holders++
			}
		}
		ok, err := RoundingWithinTolerance(sum, supply, uint32(holders), face, rateBps, Thirty360, days)
		if err != nil {
			t.Fatalf("tolerance: %v", err)
		}
		if !ok {
			t.Fatalf("iter %d: drift outside holders/2 (sum=%d supply=%d holders=%d face=%d rate=%d days=%d)",
				iter, sum, supply, holders, face, rateBps, days)
		}
	}
}
