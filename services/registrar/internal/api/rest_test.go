package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// Brief terms: face 1,000 KZT = 100,000 tiyn, 10% semi-annual, 30/360, 2026-07-03 → 2028-07-03 (Almaty midnights).
const (
	tsIssue  = 1_783_018_800 // 2026-07-03 00:00 +05:00
	tsCoupon = 1_798_916_400 // 2027-01-03
	tsMature = 1_846_177_200 // 2028-07-03
)

var (
	fMint     = solana.PublicKey{1: 1}
	fSeries   = solana.PublicKey{2: 2}
	fCash     = solana.PublicKey{3: 3}
	fAction   = solana.PublicKey{4: 4}
	fOwnerA   = solana.PublicKey{5: 5}
	fOwnerB   = solana.PublicKey{6: 6}
	fBondATAA = solana.PublicKey{7: 7}
)

type fakeRead struct{}

func (fakeRead) series() *chain.Series {
	s := &chain.Series{
		Mint: fMint, CashMint: fCash, FaceValue: 100_000, CouponRateBps: 1000, Frequency: 2, DayCount: 0,
		IssueDate: tsIssue, MaturityDate: tsMature, NextCouponDate: tsCoupon, PeriodStart: tsIssue,
		TotalIssued: 100, QuorumBps: 5000, ApprovalBps: 6667,
	}
	copy(s.ISIN[:], "KZ2C0QUPON01")
	copy(s.Ticker[:], "QPNb1")
	return s
}

func (fakeRead) action() *chain.CorporateAction {
	a := &chain.CorporateAction{
		Series: fSeries, Kind: 0, AnnouncedAt: tsIssue, RecordAt: tsCoupon, PaymentAt: tsCoupon + 2*86400,
		PeriodStart: tsIssue, PeriodEnd: tsCoupon, AccrualDays: 180, RateBps: 1000, PerUnitGross: 5000,
		CashMint: fCash, Status: 0, TotalGross: 500_000, TotalNet: 500_000,
	}
	copy(a.CorpID[:], "QPNb1-INTR-0001")
	return a
}

func (f fakeRead) AllSeries(context.Context) ([]chain.SeriesRecord, error) {
	return []chain.SeriesRecord{{PDA: fSeries, Series: f.series()}}, nil
}
func (fakeRead) SeriesPDA(mint solana.PublicKey) (solana.PublicKey, error) {
	if mint == fMint {
		return fSeries, nil
	}
	return solana.PublicKey{9: 9}, nil
}
func (f fakeRead) FetchSeries(_ context.Context, pda solana.PublicKey) (*chain.Series, error) {
	if pda == fSeries {
		return f.series(), nil
	}
	return nil, nil
}
func (f fakeRead) FetchCorporateAction(_ context.Context, pda solana.PublicKey) (*chain.CorporateAction, error) {
	if pda == fAction {
		return f.action(), nil
	}
	return nil, nil
}
func (f fakeRead) FetchActionsBySeries(context.Context, solana.PublicKey) ([]chain.ActionRecord, error) {
	return []chain.ActionRecord{{PDA: fAction, Action: f.action()}}, nil
}
func (fakeRead) FetchInvestorsBySeries(context.Context, solana.PublicKey) ([]chain.InvestorRecord, error) {
	inv := &chain.Investor{Series: fSeries, Owner: fOwnerA, BondATA: fBondATAA, InvestorType: 1, Residency: 1, TaxRateBps: 1200}
	copy(inv.KYCRef[:], fAction[:]) // any non-zero 32 bytes stand in for the SAS attestation PDA
	return []chain.InvestorRecord{{Investor: inv}}, nil
}
func (fakeRead) FetchEntitlementsByAction(context.Context, solana.PublicKey) ([]chain.EntitlementRecord, error) {
	return []chain.EntitlementRecord{
		{PDA: solana.PublicKey{10: 1}, Entitlement: &chain.Entitlement{Owner: fOwnerA, Units: 10, Gross: 50_000, Net: 50_000}},
		{PDA: solana.PublicKey{10: 2}, Entitlement: &chain.Entitlement{Owner: fOwnerB, Units: 25, Gross: 125_000, Net: 125_000, Status: 1, PaidAt: tsCoupon}},
	}, nil
}
func (fakeRead) FetchTokenAccount(_ context.Context, addr solana.PublicKey) (*chain.TokenAccount, error) {
	if addr == fBondATAA {
		return &chain.TokenAccount{Amount: 10}, nil
	}
	return nil, nil
}
func (fakeRead) FetchMint(context.Context, solana.PublicKey) (*chain.Mint, error) {
	return &chain.Mint{Decimals: 2}, nil
}

func restServer(t *testing.T, rm ReadModel) *httptest.Server {
	t.Helper()
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "rest.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	srv := httptest.NewServer(New(slog.New(slog.DiscardHandler), st, Deps{Read: rm}))
	t.Cleanup(srv.Close)
	return srv
}

func getJSON(t *testing.T, url string, want int, into any) {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != want {
		t.Fatalf("GET %s: status %d, want %d", url, resp.StatusCode, want)
	}
	if into != nil {
		if err := json.NewDecoder(resp.Body).Decode(into); err != nil {
			t.Fatalf("decode %s: %v", url, err)
		}
	}
}

func TestSeriesReadModels(t *testing.T) {
	srv := restServer(t, fakeRead{})
	var s SeriesDTO
	getJSON(t, srv.URL+"/series/"+fMint.String(), http.StatusOK, &s)
	if s.FaceValue.Display != "1000.00 tKZT" || s.ISIN != "KZ2C0QUPON01" || s.Ticker != "QPNb1" {
		t.Errorf("series = %+v", s)
	}
	if s.IssueDate != "2026-07-03" || s.MaturityDate != "2028-07-03" || s.NextCouponDate != "2027-01-03T00:00:00+05:00" {
		t.Errorf("dates = %s %s %s", s.IssueDate, s.MaturityDate, s.NextCouponDate)
	}
	if s.DayCount != "THIRTY_360" || s.Status != "Active" || s.OpenAction != nil || s.ExplorerURL == "" {
		t.Errorf("series = %+v", s)
	}

	var list []SeriesDTO
	getJSON(t, srv.URL+"/series", http.StatusOK, &list)
	if len(list) != 1 || list[0].Mint != fMint.String() {
		t.Errorf("list = %+v", list)
	}

	var inv []InvestorDTO
	getJSON(t, srv.URL+"/series/"+fMint.String()+"/investors", http.StatusOK, &inv)
	if len(inv) != 1 || inv[0].Units != "10" || inv[0].Status != "Active" {
		t.Errorf("investors = %+v", inv)
	}
	if inv[0].InvestorType != "legal_entity" || inv[0].Residency != "nonresident" || inv[0].TaxRateBps != 1200 {
		t.Errorf("investor kyc fields = %+v", inv[0])
	}
	if inv[0].KYCRef != fAction.String() {
		t.Errorf("kycRef = %q, want the attestation PDA %q", inv[0].KYCRef, fAction.String())
	}

	getJSON(t, srv.URL+"/series/"+solana.PublicKey{8: 8}.String(), http.StatusNotFound, nil)
	getJSON(t, srv.URL+"/series/not-base58!", http.StatusBadRequest, nil)
}

func TestScheduleProjectsEveryCoupon(t *testing.T) {
	srv := restServer(t, fakeRead{})
	var items []ScheduleItem
	getJSON(t, srv.URL+"/series/"+fMint.String()+"/schedule", http.StatusOK, &items)
	if len(items) != 4 {
		t.Fatalf("2 years semi-annual → 4 items, got %d", len(items))
	}
	first, last := items[0], items[3]
	if first.PeriodStart != "2026-07-03" || first.PeriodEnd != "2027-01-03" || first.AmountPerUnit.Display != "50.00 tKZT" {
		t.Errorf("first = %+v", first)
	}
	if first.RecordDate != "2027-01-03T00:00:00+05:00" || first.PaymentDate != "2027-01-05T00:00:00+05:00" {
		t.Errorf("first dates = %s %s", first.RecordDate, first.PaymentDate)
	}
	if first.Status != "Announced" || first.ActionPDA == nil || *first.ActionPDA != fAction.String() {
		t.Errorf("first status = %s %v (the announced INTR must match)", first.Status, first.ActionPDA)
	}
	if first.TotalAmount.Minor != "500000" {
		t.Errorf("total = %+v (100 units × 5,000)", first.TotalAmount)
	}
	if last.PeriodEnd != "2028-07-03" || last.AmountPerUnit.Display != "1050.00 tKZT" || last.Status != "Projected" {
		t.Errorf("last = %+v (final coupon + principal)", last)
	}
}

func TestActionAndEntitlements(t *testing.T) {
	srv := restServer(t, fakeRead{})
	var a ActionDTO
	getJSON(t, srv.URL+"/actions/"+fAction.String(), http.StatusOK, &a)
	if a.Kind != "INTR" || a.Mandatory != "MAND" || a.CorpID != "QPNb1-INTR-0001" || a.Status != "Announced" {
		t.Errorf("action = %+v", a)
	}
	if a.PerUnitGross.Display != "50.00 tKZT" || a.TotalNet.Display != "5000.00 tKZT" || a.SeriesMint != fMint.String() {
		t.Errorf("action amounts = %+v %+v", a.PerUnitGross, a.TotalNet)
	}
	if a.PeriodStart == nil || *a.PeriodStart != "2026-07-03" || a.AccrualDays == nil || *a.AccrualDays != 180 || a.Result != nil {
		t.Errorf("action period = %v %v %v", a.PeriodStart, a.AccrualDays, a.Result)
	}

	var ents []EntitlementDTO
	getJSON(t, srv.URL+"/actions/"+fAction.String()+"/entitlements?offset=1&limit=1", http.StatusOK, &ents)
	if len(ents) != 1 || ents[0].Owner != fOwnerB.String() || ents[0].Gross.Display != "1250.00 tKZT" || ents[0].Status != "Paid" {
		t.Errorf("entitlements page = %+v", ents)
	}
	if ents[0].PaidAt == nil || *ents[0].PaidAt != "2027-01-03T00:00:00+05:00" || ents[0].Vote != "None" {
		t.Errorf("entitlement times = %+v", ents[0])
	}
	getJSON(t, srv.URL+"/actions/"+fAction.String()+"/entitlements?limit=0", http.StatusBadRequest, nil)
	getJSON(t, srv.URL+"/actions/"+solana.PublicKey{11: 1}.String(), http.StatusNotFound, nil)
}

func TestReadModelsNeedChainReader(t *testing.T) {
	srv := restServer(t, nil)
	getJSON(t, srv.URL+"/series/"+fMint.String(), http.StatusServiceUnavailable, nil)
	var rows []json.RawMessage
	getJSON(t, srv.URL+"/series", http.StatusOK, &rows) // store mirror fallback
}

func TestMoneyDisplay(t *testing.T) {
	cases := []struct {
		m    money
		v    uint64
		want string
	}{
		{money{2, "tKZT"}, 50_000, "500.00 tKZT"},
		{money{2, "tKZT"}, 5, "0.05 tKZT"},
		{money{6, "USDC"}, 50_000, "0.050000 USDC"},
		{money{0, "QPN"}, 10, "10 QPN"},
	}
	for _, c := range cases {
		if got := c.m.amount(c.v).Display; got != c.want {
			t.Errorf("amount(%d, %d dec) = %q, want %q", c.v, c.m.decimals, got, c.want)
		}
	}
}

// The served document (embedded copy) must be the hand-written spec at services/registrar/openapi.yaml.
func TestServedOpenAPIIsTheSpec(t *testing.T) {
	spec, err := os.ReadFile("../../openapi.yaml")
	if err != nil {
		t.Fatalf("read spec: %v", err)
	}
	served, err := openapiFS.ReadFile("openapi.yaml")
	if err != nil {
		t.Fatalf("read embedded: %v", err)
	}
	if string(spec) != string(served) {
		t.Fatal("internal/api/openapi.yaml drifted from services/registrar/openapi.yaml — cp ../../openapi.yaml internal/api/")
	}
}

// Plan 15 (task 1521): the REST projections expose the carved fields.
func TestDTOsExposePlan15Fields(t *testing.T) {
	m := money{decimals: 2, currency: "tKZT"}
	s := &chain.Series{Hook: 1, InDefault: 1, DefaultsCount: 2, DaySecs: 2, IssueYmd: 20_261_009, IssueDate: 1_791_000_000}
	sd := seriesDTO(solana.PublicKey{1: 1}, s, m)
	if !sd.HookGate || !sd.InDefault || sd.DefaultsCount != 2 || sd.DemoClock == nil ||
		*sd.DemoClock != (DemoClockDTO{DaySecs: 2, IssueTs: 1_791_000_000, IssueDate: "2026-10-09"}) {
		t.Fatalf("series dto %+v demo %+v", sd, sd.DemoClock)
	}
	if real := seriesDTO(solana.PublicKey{1: 1}, &chain.Series{}, m); real.DemoClock != nil || real.HookGate {
		t.Fatalf("real-clock series: %+v", real)
	}
	a := &chain.CorporateAction{Status: 10, RecordAt: 1_800_000_000, FinalizeDelay: 120, DefaultedAt: 1_800_090_000,
		BankPending: 1, DisclosureHash: [32]byte{0: 0xab}}
	ad := actionDTO(solana.PublicKey{2: 2}, a, solana.PublicKey{3: 3}, m)
	if ad.Status != "Defaulted" || ad.BankPending != 1 || ad.DefaultedAt == nil || ad.CuredAt != nil ||
		ad.DisclosureHash == nil || (*ad.DisclosureHash)[:2] != "ab" || ad.FinalizedAt == nil ||
		*ad.FinalizedAt != *optDateTime(1_800_000_120) {
		t.Fatalf("action dto %+v", ad)
	}
}
