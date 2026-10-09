// Package reports builds the platform's exports (platform v2 §5.4): investor statement, annual tax certificate,
// registrar holder register and issuer payout report. Pure functions over rows the API reads from the chain.
package reports

import (
	"encoding/csv"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
)

// Payout is one holder's entitlement in one corporate action, amounts in minor units of Currency.
type Payout struct {
	Series      string `json:"series"` // ticker
	ISIN        string `json:"isin"`
	Kind        string `json:"kind"` // INTR | REDM | MCAL | …
	CorpID      string `json:"corpId"`
	Action      string `json:"action"` // CorporateAction PDA
	Owner       string `json:"owner"`
	RecordDate  string `json:"recordDate"`  // YYYY-MM-DD (Almaty)
	PaymentDate string `json:"paymentDate"` // YYYY-MM-DD (Almaty)
	PaidAt      string `json:"paidAt"`      // RFC 3339, "" until paid
	PaidYear    int    `json:"-"`
	Units       uint64 `json:"units"`
	Gross       uint64 `json:"gross"`
	Tax         uint64 `json:"tax"`
	Net         uint64 `json:"net"`
	Principal   uint64 `json:"principal"`
	Status      string `json:"status"` // Snapshotted | Paid | Retired
	Currency    string `json:"currency"`
	Decimals    uint8  `json:"decimals"`
}

// Holding is one row of a holder register.
type Holding struct {
	Series       string `json:"series"`
	ISIN         string `json:"isin"`
	Owner        string `json:"owner"`
	Units        uint64 `json:"units"`
	InvestorType string `json:"investorType"`
	Residency    string `json:"residency"`
	TaxBps       int    `json:"taxBps"`
	Status       string `json:"status"`
	KYCRef       string `json:"kycRef"`
}

// Totals sums payouts of one currency.
type Totals struct {
	Currency  string `json:"currency"`
	Payouts   int    `json:"payouts"`
	Gross     string `json:"gross"`
	Tax       string `json:"tax"`
	Net       string `json:"net"`
	Principal string `json:"principal"`
}

// Major renders minor units with a fixed number of decimals for machines: 125000 @ 2 → "1250.00".
func Major(v uint64, decimals uint8) string {
	s := strconv.FormatUint(v, 10)
	if decimals == 0 {
		return s
	}
	d := int(decimals)
	if len(s) <= d {
		s = strings.Repeat("0", d-len(s)+1) + s
	}
	return s[:len(s)-d] + "." + s[len(s)-d:]
}

// Sum totals payouts per currency (sorted by currency).
func Sum(ps []Payout) []Totals {
	type acc struct {
		n                     int
		gross, tax, net, prin uint64
		dec                   uint8
	}
	m := map[string]*acc{}
	for _, p := range ps {
		a := m[p.Currency]
		if a == nil {
			a = &acc{dec: p.Decimals}
			m[p.Currency] = a
		}
		a.n++
		a.gross += p.Gross
		a.tax += p.Tax
		a.net += p.Net
		a.prin += p.Principal
	}
	out := make([]Totals, 0, len(m))
	for cur, a := range m {
		out = append(out, Totals{Currency: cur, Payouts: a.n, Gross: Major(a.gross, a.dec), Tax: Major(a.tax, a.dec),
			Net: Major(a.net, a.dec), Principal: Major(a.prin, a.dec)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Currency < out[j].Currency })
	return out
}

// TaxYear keeps the payouts actually paid in a calendar year (Almaty): the basis of the tax certificate.
func TaxYear(ps []Payout, year int) []Payout {
	out := []Payout{}
	for _, p := range ps {
		if p.Status == "Paid" && p.PaidYear == year {
			out = append(out, p)
		}
	}
	return out
}

// PayoutTable is the CSV body of statements, tax certificates and payout reports.
func PayoutTable(ps []Payout) ([]string, [][]string) {
	header := []string{"payment_date", "series", "isin", "kind", "corp_id", "owner", "units", "gross", "tax_withheld",
		"net", "principal", "currency", "status", "paid_at", "action"}
	rows := make([][]string, 0, len(ps))
	for _, p := range ps {
		rows = append(rows, []string{p.PaymentDate, p.Series, p.ISIN, p.Kind, p.CorpID, p.Owner,
			strconv.FormatUint(p.Units, 10), Major(p.Gross, p.Decimals), Major(p.Tax, p.Decimals), Major(p.Net, p.Decimals),
			Major(p.Principal, p.Decimals), p.Currency, p.Status, p.PaidAt, p.Action})
	}
	return header, rows
}

// HoldingTable is the CSV body of a holder register.
func HoldingTable(hs []Holding) ([]string, [][]string) {
	header := []string{"series", "isin", "owner", "units", "investor_type", "residency", "tax_bps", "status", "kyc_ref"}
	rows := make([][]string, 0, len(hs))
	for _, h := range hs {
		rows = append(rows, []string{h.Series, h.ISIN, h.Owner, strconv.FormatUint(h.Units, 10), h.InvestorType,
			h.Residency, strconv.Itoa(h.TaxBps), h.Status, h.KYCRef})
	}
	return header, rows
}

// guardCell defuses CSV injection: a cell starting with = + - @ or a tab/CR would
// run as a formula in Excel (the BOM makes Excel open the file); prefix a ' so it
// stays text. Cells that parse as numbers (-5, +1.25) are left untouched.
func guardCell(s string) string {
	if s == "" {
		return s
	}
	switch s[0] {
	case '=', '+', '-', '@', '\t', '\r':
		if _, err := strconv.ParseFloat(s, 64); err != nil {
			return "'" + s
		}
	}
	return s
}

// WriteCSV writes UTF-8 with a BOM (Excel opens Cyrillic correctly), a header row, the rows, then "# key,value"
// metadata lines (network, generation time, source accounts) so a file is self-describing.
func WriteCSV(w io.Writer, header []string, rows [][]string, meta [][2]string) error {
	if _, err := io.WriteString(w, "\ufeff"); err != nil {
		return fmt.Errorf("write bom: %w", err)
	}
	cw := csv.NewWriter(w)
	if err := cw.Write(header); err != nil {
		return fmt.Errorf("write header: %w", err)
	}
	for _, row := range rows {
		for i, c := range row {
			row[i] = guardCell(c)
		}
		if err := cw.Write(row); err != nil {
			return fmt.Errorf("write rows: %w", err)
		}
	}
	for _, kv := range meta {
		if err := cw.Write([]string{"# " + kv[0], guardCell(kv[1])}); err != nil {
			return fmt.Errorf("write meta: %w", err)
		}
	}
	cw.Flush()
	return cw.Error()
}
