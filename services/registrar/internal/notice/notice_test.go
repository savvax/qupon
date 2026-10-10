package notice

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// demoData returns the golden fixture inputs (brief numbers; placeholders per
// fixtures/notices/README.md).
func demoData(kind Kind, lang string) Data {
	base := Data{
		Kind:         kind,
		Lang:         lang,
		PaymentDate:  "2027-01-03",
		IssuerName:   IssuerNameDefault,
		ISIN:         "KZT0000000000",
		Ticker:       "QPON",
		TotalNet:     5000,
		Ccy:          "KZT",
		Holders:      3,
		RecordDate:   "2026-12-27",
		Principal:    100000,
		FinalCoupon:  5000,
		Days:         47,
		OldRateBps:   1000,
		NewRateBps:   1200,
		CouponNumber: 1,
	}
	switch kind {
	case KindINTR:
		base.PaymentDate, base.NextCouponDate = "2027-01-03", "2027-07-03"
	case KindREDM:
		base.PaymentDate = "2027-07-03"
	case KindMCAL:
		base.PaymentDate, base.RecordDate = "2026-08-20", "2026-07-20"
		base.AccruedNetMinor = 187420
	case KindCHAN:
		base.PaymentDate = "2027-01-10"
		base.EffectiveDate = "2027-01-03"
	case KindPCAL:
		base.PaymentDate = "2027-01-03"
	case KindBMET:
		base.PaymentDate, base.MeetingDate = "2027-02-01", "2027-01-15"
		base.EffectiveDate = "2027-02-01"
		base.Approved = true
	case KindDEFAULT:
		base.PaymentDate, base.DueDate, base.DefaultDate = "2027-01-05", "2027-01-05", "2027-01-10"
	case KindCURE:
		base.PaymentDate, base.DueDate = "2027-01-05", "2027-01-05"
		base.DefaultDate, base.CureDate = "2027-01-10", "2027-01-12"
	}
	return base
}

func TestRenderGolden(t *testing.T) {
	kinds := map[string]Kind{
		"intr": KindINTR, "redm": KindREDM, "mcal": KindMCAL, "pcal": KindPCAL,
		"bmet": KindBMET, "chan": KindCHAN, "default": KindDEFAULT, "cure": KindCURE,
	}
	langs := []string{"en", "ru", "kk"}
	root := filepath.Join("..", "..", "..", "..", "fixtures", "notices")

	for name, kind := range kinds {
		for _, lang := range langs {
			goldenPath := filepath.Join(root, name+"."+lang+".golden.txt")
			want, err := os.ReadFile(goldenPath)
			if err != nil {
				t.Fatalf("read %s: %v", goldenPath, err)
			}
			got, err := Render(demoData(kind, lang))
			if err != nil {
				t.Fatalf("%s/%s: %v", name, lang, err)
			}
			if got != strings.TrimSpace(string(want)) {
				t.Errorf("%s/%s mismatch:\n got: %s\nwant: %s", name, lang, got, string(want))
			}
		}
	}
}

func TestOrdinals(t *testing.T) {
	cases := []struct {
		n          int
		en, ru, kk string
	}{
		{1, "1st", "1-й", "1-ші"}, {2, "2nd", "2-й", "2-ші"}, {3, "3rd", "3-й", "3-ші"},
		{4, "4th", "4-й", "4-ші"}, {11, "11th", "11-й", "11-ші"}, {12, "12th", "12-й", "12-ші"},
		{13, "13th", "13-й", "13-ші"}, {21, "21st", "21-й", "21-ші"}, {22, "22nd", "22-й", "22-ші"},
	}
	for _, c := range cases {
		if got := OrdinalEN(c.n); got != c.en {
			t.Errorf("OrdinalEN(%d) = %q, want %q", c.n, got, c.en)
		}
		if got := OrdinalRU(c.n); got != c.ru {
			t.Errorf("OrdinalRU(%d) = %q, want %q", c.n, got, c.ru)
		}
		if got := OrdinalKK(c.n); got != c.kk {
			t.Errorf("OrdinalKK(%d) = %q, want %q", c.n, got, c.kk)
		}
	}
}

func TestAmount(t *testing.T) {
	cases := map[uint64]string{0: "0", 5000: "5,000", 100000: "100,000", 239250000: "239,250,000"}
	for in, want := range cases {
		if got := Amount(in); got != want {
			t.Errorf("Amount(%d) = %q, want %q", in, got, want)
		}
	}
	if got := Amount2(187420); got != "1,874.20" {
		t.Errorf("Amount2 = %q, want 1,874.20", got)
	}
}

func TestRenderUnsupported(t *testing.T) {
	d := demoData(KindINTR, "en")
	d.Kind = 9
	if _, err := Render(d); err == nil {
		t.Error("expected error for unsupported kind")
	}
	d.Kind = KindINTR
	d.Lang = "de"
	if _, err := Render(d); err == nil {
		t.Error("expected error for unsupported lang")
	}
}
