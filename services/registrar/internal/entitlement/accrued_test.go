// Table tests for the CivilClock and AccruedSigned mirrors over the shared
// vectors in fixtures/entitlement.json (clock_cases, accrued_cases). The same
// JSON drives the Rust crate and the TS client tests.
package entitlement

import (
	"testing"
)

type clockCase struct {
	ID           string `json:"id"`
	DaySecs      uint32 `json:"day_secs"`
	IssueTs      int64  `json:"issue_ts"`
	IssueYmd     uint32 `json:"issue_ymd"`
	Ymd          uint32 `json:"ymd"`
	Ts           int64  `json:"ts"`
	PlusMonths   uint32 `json:"plus_months"`
	PlusMonthsTs int64  `json:"plus_months_ts"`
}

type accruedCase struct {
	ID       string `json:"id"`
	Units    uint64 `json:"units"`
	Face     uint64 `json:"face"`
	RateBps  uint32 `json:"rate_bps"`
	DayCount string `json:"day_count"`
	Start    string `json:"start"`
	Settle   string `json:"settle"`
	Days     int32  `json:"days"`
	Accrued  int64  `json:"accrued"`
}

func clockOf(t *testing.T, c clockCase) CivilClock {
	t.Helper()
	if c.DaySecs == 0 {
		return CivilClockReal(5 * 3600) // Asia/Almaty
	}
	issue, err := YMDFromPacked(c.IssueYmd)
	if err != nil {
		t.Fatalf("issue_ymd %d: %v", c.IssueYmd, err)
	}
	clk, err := CivilClockDemo(c.DaySecs, c.IssueTs, issue)
	if err != nil {
		t.Fatalf("demo clock: %v", err)
	}
	return clk
}

func TestClockCases(t *testing.T) {
	for _, c := range loadFixtures(t).ClockCases {
		t.Run(c.ID, func(t *testing.T) {
			clk := clockOf(t, c)
			d, err := YMDFromPacked(c.Ymd)
			if err != nil {
				t.Fatalf("ymd %d: %v", c.Ymd, err)
			}
			gotTs, err := clk.Ts(d)
			if err != nil || gotTs != c.Ts {
				t.Errorf("ts(%d) = (%d, %v), want %d", c.Ymd, gotTs, err, c.Ts)
			}
			gotD, err := clk.Civil(c.Ts)
			if err != nil || gotD != d {
				t.Errorf("civil(%d) = (%v, %v), want %v", c.Ts, gotD, err, d)
			}
			gotM, err := clk.AddMonths(c.Ts, c.PlusMonths)
			if err != nil || gotM != c.PlusMonthsTs {
				t.Errorf("add_months(%d, %d) = (%d, %v), want %d", c.Ts, c.PlusMonths, gotM, err, c.PlusMonthsTs)
			}
		})
	}
}

func TestAccruedCases(t *testing.T) {
	for _, c := range loadFixtures(t).AccruedCases {
		t.Run(c.ID, func(t *testing.T) {
			amount, days, err := AccruedSigned(c.Units, c.Face, c.RateBps,
				dayCount(t, c.DayCount), ymd(t, c.Start), ymd(t, c.Settle))
			if err != nil {
				t.Fatalf("accrued_signed: %v", err)
			}
			if amount != c.Accrued || days != c.Days {
				t.Errorf("accrued_signed = (%d, %d), want (%d, %d)", amount, days, c.Accrued, c.Days)
			}
		})
	}
}

func TestCivilClockDemoValidation(t *testing.T) {
	issue, _ := NewYMD(2026, 10, 9)
	for _, bad := range []uint32{0, 86_400, 90_000} {
		if _, err := CivilClockDemo(bad, 1_791_000_000, issue); err != ErrInvalidPeriod {
			t.Errorf("CivilClockDemo(%d) err = %v, want ErrInvalidPeriod", bad, err)
		}
	}
	if _, err := CivilClockDemo(1, 1_791_000_000, issue); err != nil {
		t.Errorf("CivilClockDemo(1): %v", err)
	}
}

func TestCivilClockMidnight(t *testing.T) {
	clk := CivilClockReal(5 * 3600)
	if !clk.IsMidnight(1_790_967_600) { // 2026-10-03 00:00 Almaty (days_from_epoch 20729)
		t.Error("expected an Almaty midnight")
	}
	if clk.IsMidnight(1_790_967_601) {
		t.Error("1 s past midnight must not be a midnight")
	}
	if _, err := clk.Civil(1_790_967_601); err != ErrInvalidDate {
		t.Errorf("civil(non-midnight) err = %v, want ErrInvalidDate", err)
	}
	if clk.IsDemo() {
		t.Error("real clock must not be demo")
	}
}
