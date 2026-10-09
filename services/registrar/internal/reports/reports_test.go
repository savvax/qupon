package reports

import (
	"bytes"
	"strings"
	"testing"
)

// The brief's coupon: 1,000 KZT face, 10% semi-annual → 50 KZT per unit; holders 10/25/65 units.
func brief() []Payout {
	mk := func(owner string, units, gross, tax uint64, status string, year int) Payout {
		return Payout{Series: "QPNb1", Kind: "INTR", Owner: owner, Units: units, Gross: gross, Tax: tax,
			Net: gross - tax, Status: status, PaidYear: year, Currency: "tKZT", Decimals: 2, PaymentDate: "2026-07-05"}
	}
	return []Payout{
		mk("A", 10, 50_000, 0, "Paid", 2026),
		mk("B", 25, 125_000, 18_750, "Paid", 2026), // non-resident 15%
		mk("C", 65, 325_000, 0, "Snapshotted", 0),  // not paid yet
		mk("D", 65, 325_000, 32_500, "Paid", 2025), // last year
	}
}

func TestMajor(t *testing.T) {
	for _, c := range []struct {
		v    uint64
		d    uint8
		want string
	}{{50_000, 2, "500.00"}, {5, 2, "0.05"}, {0, 2, "0.00"}, {1_250_000_000, 6, "1250.000000"}, {7, 0, "7"}} {
		if got := Major(c.v, c.d); got != c.want {
			t.Errorf("Major(%d,%d) = %s, want %s", c.v, c.d, got, c.want)
		}
	}
}

func TestTaxYearAndTotals(t *testing.T) {
	paid := TaxYear(brief(), 2026)
	if len(paid) != 2 {
		t.Fatalf("2026 payouts = %d, want 2 (unpaid and 2025 excluded)", len(paid))
	}
	tot := Sum(paid)
	if len(tot) != 1 || tot[0].Gross != "1750.00" || tot[0].Tax != "187.50" || tot[0].Net != "1562.50" || tot[0].Payouts != 2 {
		t.Fatalf("totals = %+v", tot)
	}
	all := Sum(brief())
	if all[0].Gross != "8250.00" {
		t.Fatalf("all gross = %s, want 500+1250+3250+3250", all[0].Gross)
	}
}

func TestWriteCSV(t *testing.T) {
	var buf bytes.Buffer
	h, rows := PayoutTable(brief()[:1])
	rows[0][4] = `ISS, "quoted"`
	if err := WriteCSV(&buf, h, rows, [][2]string{{"network", "devnet"}}); err != nil {
		t.Fatal(err)
	}
	s := buf.String()
	if !strings.HasPrefix(s, "\ufeffpayment_date,series,") {
		t.Fatalf("no BOM/header: %q", s[:40])
	}
	if !strings.Contains(s, `"ISS, ""quoted"""`) || !strings.Contains(s, ",500.00,0.00,500.00,") {
		t.Fatalf("row = %q", s)
	}
	if !strings.HasSuffix(s, "# network,devnet\n") {
		t.Fatalf("meta = %q", s)
	}
}

// Review focus: CSV formula injection — a user-entered cell starting with = + - @
// or a tab would run as a formula in Excel (task 1416).
func TestWriteCSVFormulaGuard(t *testing.T) {
	var buf bytes.Buffer
	h, rows := HoldingTable([]Holding{{Series: "=1+1", InvestorType: "-abc", Residency: "@KZ", KYCRef: "\tX",
		Owner: "o", ISIN: "i", Units: 1, TaxBps: 0, Status: "Active"}})
	rows[0][3] = "-5" // numeric cells stay untouched
	if err := WriteCSV(&buf, h, rows, nil); err != nil {
		t.Fatal(err)
	}
	s := buf.String()
	for _, want := range []string{"'=1+1", ",-5,", "'-abc", "'@KZ", "'\tX"} {
		if !strings.Contains(s, want) {
			t.Errorf("csv missing %q: %q", want, s)
		}
	}
	if strings.Contains(s, ",-abc,") || strings.Contains(s, ",@KZ,") {
		t.Errorf("unguarded formula cell: %q", s)
	}
}
