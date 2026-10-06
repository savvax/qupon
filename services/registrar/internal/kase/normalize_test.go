package kase

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	return b
}

// TestNormalizeTEBNb10 checks the normaliser against the captured kase.kz bodies
// (platform v2 task 1001 review focus): dates, bps, minor units, schedule.
func TestNormalizeTEBNb10(t *testing.T) {
	out, err := NormalizeBond(
		fixture(t, "bond_TEBNb10.json"),
		fixture(t, "characteristics_TEBNb10.json"),
		fixture(t, "coupon_payments_TEBNb10.json"),
		fixture(t, "trade_info_TEBNb10.json"),
		fixture(t, "last_deals_TEBNb10.json"),
	)
	if err != nil {
		t.Fatalf("normalize: %v", err)
	}
	if out.Ticker != "TEBNb10" || out.ISIN != "KZ2C00000065" {
		t.Errorf("ticker/isin = %s/%s", out.Ticker, out.ISIN)
	}
	if out.Issuer != "ForteBank" || out.IssuerCode != "ASBN" {
		t.Errorf("issuer = %s/%s, want ForteBank/ASBN", out.Issuer, out.IssuerCode)
	}
	if out.Currency != "KZT" {
		t.Errorf("currency = %s, want KZT", out.Currency)
	}
	// nominal 0,01 KZT → 1 tiyn; coupon 8,000 % → 800 bps; basis 30/360 → THIRTY_360
	if out.Face != 1 || out.CouponRate != 800 {
		t.Errorf("face/couponRate = %d/%d, want 1/800", out.Face, out.CouponRate)
	}
	if out.DayCount != "THIRTY_360" {
		t.Errorf("dayCount = %q, want THIRTY_360", out.DayCount)
	}
	if out.Frequency != 2 {
		t.Errorf("frequency = %d, want 2 (semi-annual)", out.Frequency)
	}
	if out.IssueDate != "2006-11-29" || out.MaturityDate != "2026-11-29" {
		t.Errorf("dates = %s..%s", out.IssueDate, out.MaturityDate)
	}
	if len(out.Schedule) == 0 {
		t.Fatal("schedule is empty")
	}
	first := out.Schedule[0]
	if first.RecordDate != "2007-05-28" || first.Start != "2007-05-29" || first.End != "2007-06-08" || first.Rate != 850 {
		t.Errorf("schedule[0] = %+v", first)
	}
	if out.Market.Price == nil || *out.Market.Price != 67.52 ||
		out.Market.Bid == nil || *out.Market.Bid != 67.5249 ||
		out.Market.Offer == nil || *out.Market.Offer != 84.7279 ||
		out.Market.Volume == nil || *out.Market.Volume != 10106888.28 {
		t.Errorf("market = %+v", out.Market)
	}
	if out.Market.Date != "2026-10-06" {
		t.Errorf("market date = %s, want 2026-10-06 (newest trade-info row)", out.Market.Date)
	}
	if string(out.Market.LastDeals) != "[]" {
		t.Errorf("lastDeals = %s, want the raw [] body", out.Market.LastDeals)
	}
}

// The bond snapshot alone must still answer (the enrichment endpoints degrade).
func TestNormalizeBondOnly(t *testing.T) {
	out, err := NormalizeBond(fixture(t, "bond_TEBNb10.json"), nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("normalize: %v", err)
	}
	if out.Ticker != "TEBNb10" || out.ISIN != "KZ2C00000065" || out.CouponRate != 800 {
		t.Errorf("out = %+v", out)
	}
	if len(out.Schedule) != 0 || out.Frequency != 0 {
		t.Errorf("schedule/frequency should be empty without coupons: %d/%d", len(out.Schedule), out.Frequency)
	}
	if out.Market.Date != "2012-03-07" {
		t.Errorf("market date fallback = %s, want the bond entry date", out.Market.Date)
	}
}

func TestNormalizeNews(t *testing.T) {
	for _, tc := range []struct {
		file string
		lang string
		want int64
	}{
		{"news_ASBN_ru.json", "ru", 1575988},
		{"news_ASBN_en.json", "en", 1576006},
	} {
		out, err := NormalizeNews("ASBN", tc.lang, fixture(t, tc.file))
		if err != nil {
			t.Fatalf("normalize news %s: %v", tc.file, err)
		}
		if len(out.Items) == 0 {
			t.Fatalf("%s: no items", tc.file)
		}
		if out.Items[0].ID != tc.want || out.Items[0].Language != tc.lang || out.Items[0].Subject == "" {
			t.Errorf("%s first item = %+v, want id %d lang %s", tc.file, out.Items[0], tc.want, tc.lang)
		}
	}
}

func TestNormalizeBadBondBody(t *testing.T) {
	if _, err := NormalizeBond([]byte("<html>"), nil, nil, nil, nil); err == nil {
		t.Fatal("html bond body should fail")
	}
	if _, err := NormalizeNews("ASBN", "ru", []byte("[]")); err == nil {
		t.Fatal("news body with the wrong shape should fail")
	}
}

func TestParseNumberAndDateOnly(t *testing.T) {
	for s, want := range map[string]float64{
		"0,01": 0.01, "8,000": 8, "4 500 000 000": 4.5e9, "67,52": 67.52, "1,0": 1,
	} {
		if got, ok := parseNumber(s); !ok || got != want {
			t.Errorf("parseNumber(%q) = %v/%v, want %v", s, got, ok, want)
		}
	}
	for s, want := range map[string]string{
		"2026-10-06":          "2026-10-06",
		"2026-10-05 16:59:40": "2026-10-05",
		"2012-03-07T16:58:44": "2012-03-07",
		"":                    "",
	} {
		if got := dateOnly(s); got != want {
			t.Errorf("dateOnly(%q) = %q, want %q", s, got, want)
		}
	}
	for s, want := range map[string]string{
		"30/360": "THIRTY_360", "360/360": "THIRTY_360", " act/365 ": "ACT_365", "ACT365": "ACT_365", "?": "",
	} {
		if got := dayCount(s); got != want {
			t.Errorf("dayCount(%q) = %q, want %q", s, got, want)
		}
	}
	// JSON round-trip: the DTO marshals with the spec's field names.
	b, err := json.Marshal(Bond{Ticker: "TEBNb10", Schedule: []ScheduleEntry{{}}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	for _, key := range []string{`"ticker"`, `"couponRate"`, `"maturityDate"`, `"recordDate"`, `"fetchedAt"`, `"stale"`} {
		if !strings.Contains(string(b), key) {
			t.Errorf("marshalled bond missing key %s: %s", key, b)
		}
	}
}
