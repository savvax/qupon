package api

// GET /holders/{owner} (task 1525): positions with KYC and payout route, entitlements with the
// paying tx from the activity feed, upcoming payouts through the series clock (real and demo).

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// holderServer is restServer but hands back the store (paid-tx rows are seeded through it).
func holderServer(t *testing.T, rm ReadModel) (*httptest.Server, *store.Store) {
	t.Helper()
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "holders.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	srv := httptest.NewServer(New(slog.New(slog.DiscardHandler), st, Deps{Read: rm}))
	t.Cleanup(srv.Close)
	return srv, st
}

func seedPaidTx(t *testing.T, st *store.Store, action, owner, sig string) {
	t.Helper()
	a := action
	if _, err := st.InsertActivity(t.Context(), store.Activity{
		Ts: time.Now().Unix(), ActionPDA: &a, Kind: "EntitlementPaid",
		Payload: json.RawMessage(`{"owner":"` + owner + `","net":"50000"}`), Sig: sig,
	}); err != nil {
		t.Fatalf("seed activity: %v", err)
	}
}

func TestHolderLookup(t *testing.T) {
	srv, st := holderServer(t, fakeRead{})
	seedPaidTx(t, st, fAction.String(), fOwnerA.String(), "sigOwnerA")
	seedPaidTx(t, st, fAction.String(), fOwnerB.String(), "sigOwnerB") // another holder's payout

	var h HolderLookupDTO
	getJSON(t, srv.URL+"/holders/"+fOwnerA.String(), http.StatusOK, &h)
	if h.Owner != fOwnerA.String() {
		t.Fatalf("owner = %s", h.Owner)
	}
	if len(h.Positions) != 1 {
		t.Fatalf("positions = %+v", h.Positions)
	}
	p := h.Positions[0]
	if p.Mint != fMint.String() || p.Series != fSeries.String() || p.Units != "10" || p.Status != "Active" {
		t.Errorf("position = %+v", p)
	}
	if !p.KYC.Attested || p.KYC.Ref != fAction.String() {
		t.Errorf("kyc = %+v (attested via the SAS attestation PDA)", p.KYC)
	}
	if p.PayoutRoute == nil || p.PayoutRoute.Route != "bank" || p.PayoutRoute.BankRefHash == nil {
		t.Fatalf("payout route = %+v, want bank with a bank ref hash", p.PayoutRoute)
	}
	want := make([]byte, 32)
	copy(want, "bank-ref") // the on-chain [32; u8] keeps its NUL padding
	if p.PayoutRoute.BankRefHash == nil || *p.PayoutRoute.BankRefHash != hex.EncodeToString(want) {
		t.Errorf("bankRefHash = %s, want %s", *p.PayoutRoute.BankRefHash, want)
	}
	if p.PayoutRoute.UpdatedAt == nil || *p.PayoutRoute.UpdatedAt != "2027-01-03T00:00:00+05:00" {
		t.Errorf("route updatedAt = %v", p.PayoutRoute.UpdatedAt)
	}

	if len(h.Entitlements) != 1 {
		t.Fatalf("entitlements = %+v", h.Entitlements)
	}
	e := h.Entitlements[0]
	if e.Kind != "INTR" || e.Units != "10" || e.Gross.Display != "500.00 tKZT" || e.Status != "Snapshotted" {
		t.Errorf("entitlement = %+v", e)
	}
	if e.PaidTx == nil || *e.PaidTx != "sigOwnerA" || e.PaidTxURL == nil || *e.PaidTxURL == "" {
		t.Errorf("paid tx = %v %v, want sigOwnerA with an explorer link", e.PaidTx, e.PaidTxURL)
	}

	// No action is open and the next coupon (2027-01-03) is ahead: the projected payout shows
	// record = period end, payment = +2 civil days (docs/03-domain §1).
	if len(h.UpcomingPayouts) != 1 {
		t.Fatalf("upcoming = %+v", h.UpcomingPayouts)
	}
	u := h.UpcomingPayouts[0]
	if u.Mint != fMint.String() || u.Kind != "INTR (projected)" || u.ActionPDA != nil {
		t.Errorf("upcoming = %+v", u)
	}
	if u.RecordAt != "2027-01-03T00:00:00+05:00" || u.PaymentAt != "2027-01-05T00:00:00+05:00" {
		t.Errorf("upcoming dates = %s %s", u.RecordAt, u.PaymentAt)
	}
}

func TestHolderLookupEmptyAndErrors(t *testing.T) {
	srv, _ := holderServer(t, fakeRead{})
	var h HolderLookupDTO
	getJSON(t, srv.URL+"/holders/"+fOwnerB.String(), http.StatusOK, &h) // registered nowhere, no entitlements
	if len(h.Positions) != 0 || len(h.Entitlements) != 0 || len(h.UpcomingPayouts) != 0 {
		t.Errorf("empty lookup = %+v", h)
	}
	getJSON(t, srv.URL+"/holders/not-base58!", http.StatusBadRequest, nil)

	noChain, _ := holderServer(t, nil)
	getJSON(t, noChain.URL+"/holders/"+fOwnerA.String(), http.StatusServiceUnavailable, nil)
}

// The open action wins over the projection and carries its own dates and PDA.
func TestHolderLookupUpcomingFromOpenAction(t *testing.T) {
	srv, _ := holderServer(t, openActionRead{})
	var h HolderLookupDTO
	getJSON(t, srv.URL+"/holders/"+fOwnerA.String(), http.StatusOK, &h)
	if len(h.UpcomingPayouts) != 1 {
		t.Fatalf("upcoming = %+v", h.UpcomingPayouts)
	}
	u := h.UpcomingPayouts[0]
	if u.ActionPDA == nil || *u.ActionPDA != fAction.String() || u.Kind != "INTR" {
		t.Errorf("upcoming = %+v, want the open INTR action", u)
	}
	if u.RecordAt != "2027-01-03T00:00:00+05:00" || u.PaymentAt != "2027-01-05T00:00:00+05:00" {
		t.Errorf("upcoming dates = %s %s", u.RecordAt, u.PaymentAt)
	}
}

// openActionRead serves the brief series with the announced INTR open.
type openActionRead struct{ fakeRead }

func (openActionRead) FetchSeries(_ context.Context, pda solana.PublicKey) (*chain.Series, error) {
	s := fakeRead{}.series()
	oa := fAction
	s.OpenAction = &oa
	return s, nil
}

func TestPaymentAfterUsesTheSeriesClock(t *testing.T) {
	// Real clock: two civil days after the 2027-01-03 Almaty midnight.
	real := fakeRead{}.series()
	pay, err := paymentAfter(real, tsCoupon)
	if err != nil {
		t.Fatal(err)
	}
	if pay != tsCoupon+2*86400 {
		t.Errorf("real payment = %d, want +2 days", pay)
	}
	// Demo clock (plan 15 D7): 1 s per civil day anchored at the issue date → +2 s.
	demo := fakeRead{}.series()
	demo.DaySecs, demo.IssueYmd = 1, 20_260_703 // 2026-07-03
	record := demo.IssueDate + 182              // a clock midnight 182 civil days in
	pay, err = paymentAfter(demo, record)
	if err != nil {
		t.Fatal(err)
	}
	if pay != record+2 {
		t.Errorf("demo payment = %d, want record+2s", pay)
	}
}

// ?featured=1 lists only admin-curated series; featured ones list first in /series (task 1525).
func TestSeriesFeatured(t *testing.T) {
	srv, st := holderServer(t, twoSeries{})
	if err := st.UpsertSeriesSettings(t.Context(), store.SeriesSettings{
		SeriesMint: fMint2.String(), Featured: true,
	}); err != nil {
		t.Fatalf("upsert settings: %v", err)
	}

	var all []SeriesDTO
	getJSON(t, srv.URL+"/series", http.StatusOK, &all)
	if len(all) != 2 || all[0].Mint != fMint2.String() || !all[0].Featured || all[1].Featured {
		t.Fatalf("featured must list first: %+v", all)
	}

	var only []SeriesDTO
	getJSON(t, srv.URL+"/series?featured=1", http.StatusOK, &only)
	if len(only) != 1 || only[0].Mint != fMint2.String() || !only[0].Featured {
		t.Fatalf("?featured=1 = %+v", only)
	}
}

var fMint2 = solana.PublicKey{12: 12}

// twoSeries lists the brief series plus a second one so ordering is observable.
type twoSeries struct{ fakeRead }

func (twoSeries) AllSeries(context.Context) ([]chain.SeriesRecord, error) {
	first := fakeRead{}.series()
	second := fakeRead{}.series()
	second.Mint = fMint2
	return []chain.SeriesRecord{{PDA: fSeries, Series: first}, {PDA: solana.PublicKey{13: 13}, Series: second}}, nil
}
