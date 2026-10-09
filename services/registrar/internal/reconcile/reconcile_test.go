package reconcile

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"slices"
	"testing"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
)

// fakeChain is an in-memory Reader: the brief's demo action — 3 holders with
// 10/25/65 units, face 100 000 tiyn, 10% semi-annual (180d) → 50 000/125 000/325 000.
type fakeChain struct {
	series *chain.Series
	action *chain.CorporateAction
	mint   *chain.Mint
	// investors deliberately stored owner-descending: Run must sort.
	investors    []chain.InvestorRecord
	entitlements []chain.EntitlementRecord
	atas         map[solana.PublicKey]*chain.TokenAccount
	gotMinSlot   uint64 // last minContextSlot passed for an ATA read
}

func (f *fakeChain) FetchSeries(_ context.Context, _ solana.PublicKey) (*chain.Series, error) {
	return f.series, nil
}

func (f *fakeChain) FetchCorporateAction(_ context.Context, _ solana.PublicKey) (*chain.CorporateAction, error) {
	return f.action, nil
}

func (f *fakeChain) FetchMint(_ context.Context, _ solana.PublicKey) (*chain.Mint, error) {
	return f.mint, nil
}

func (f *fakeChain) FetchInvestorsBySeries(_ context.Context, _ solana.PublicKey) ([]chain.InvestorRecord, error) {
	return f.investors, nil
}

func (f *fakeChain) FetchEntitlementsByAction(_ context.Context, _ solana.PublicKey) ([]chain.EntitlementRecord, error) {
	return f.entitlements, nil
}

func (f *fakeChain) FetchTokenAccountAt(_ context.Context, addr solana.PublicKey, minSlot uint64) (*chain.TokenAccount, error) {
	f.gotMinSlot = minSlot
	return f.atas[addr], nil
}

var (
	actionPDA = solana.PublicKey{9: 9}
	seriesPDA = solana.PublicKey{8: 8}
	bondMint  = solana.PublicKey{7: 7}
	// owners ordered ascending by bytes: 0x01… < 0x02… < 0x03…
	ownerA = solana.PublicKey{0: 1}
	ownerB = solana.PublicKey{0: 2}
	ownerC = solana.PublicKey{0: 3}
)

// expectedHash recomputes sha256(prev ‖ owner ‖ units_le) independently of
// hashStep, spelled out so an algorithm drift fails the test.
func expectedHash() [32]byte {
	h := sha256.Sum256(append(append(make([]byte, 0, 72), make([]byte, 32)...), append(ownerA[:], le(10)...)...))
	h = sha256.Sum256(append(append(h[:], ownerB[:]...), le(25)...))
	h = sha256.Sum256(append(append(h[:], ownerC[:]...), le(65)...))
	return h
}

func le(v uint64) []byte {
	var b [8]byte
	binary.LittleEndian.PutUint64(b[:], v)
	return b[:]
}

func TestDiffFieldsReportsEveryDifferingField(t *testing.T) {
	a := Entry{Units: 10, Gross: 500, Tax: 50, Net: 450, Principal: 0}
	if got := a.diffFields(a); got != nil {
		t.Errorf("equal entries: fields = %v, want nil", got)
	}
	b := a
	b.Gross, b.Net, b.Principal = 499, 449, 9
	got := a.diffFields(b)
	want := []string{"gross", "net", "principal"}
	if !slices.Equal(got, want) {
		t.Errorf("fields = %v, want %v", got, want)
	}
}

// newFixture builds the completed demo action: INTR coupon, 100 supply,
// holders A/B/C = 10/25/65 units, tax 0 → totals 500 000 gross.
func newFixture(t *testing.T) *fakeChain {
	t.Helper()
	hash := expectedHash()
	fc := &fakeChain{
		series: &chain.Series{
			Mint: bondMint, FaceValue: 100_000, DayCount: 0,
		},
		action: &chain.CorporateAction{
			Series: seriesPDA, Kind: 0 /* INTR */, Status: 5, /* Completed */
			AccrualDays: 180, RateBps: 1000, SnapshotSlot: 300_000_001, SnapshotHash: hash,
			UnitsSnapshotted: 100, HoldersSnapshotted: 3,
			TotalGross: 500_000, TotalTax: 0, TotalNet: 500_000, TotalPrincipal: 0,
		},
		mint: &chain.Mint{Supply: 100},
		atas: map[solana.PublicKey]*chain.TokenAccount{},
	}
	holders := []struct {
		owner solana.PublicKey
		units uint64
		gross uint64
	}{
		{ownerA, 10, 50_000},
		{ownerB, 25, 125_000},
		{ownerC, 65, 325_000},
	}
	for i, h := range holders {
		ata := solana.PublicKey{0: byte(i + 1), 1: 0xAA}
		fc.investors = append(fc.investors, chain.InvestorRecord{
			PDA: solana.PublicKey{0: byte(i + 1), 1: 0xBB},
			Investor: &chain.Investor{
				Series: seriesPDA, Owner: h.owner, BondATA: ata, TaxRateBps: 0,
			},
		})
		fc.atas[ata] = &chain.TokenAccount{Mint: bondMint, Owner: h.owner, Amount: h.units}
		fc.entitlements = append(fc.entitlements, chain.EntitlementRecord{
			PDA: solana.PublicKey{0: byte(i + 1), 1: 0xCC},
			Entitlement: &chain.Entitlement{
				Action: actionPDA, Owner: h.owner, Units: h.units, Gross: h.gross, Net: h.gross,
			},
		})
	}
	return fc
}

func TestRunOkOnCompletedAction(t *testing.T) {
	fc := newFixture(t)

	rep, err := Run(t.Context(), fc, actionPDA)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !rep.Ok {
		t.Fatalf("Ok = false, mismatches %+v hashMatches=%v totalsMatch=%v",
			rep.Mismatches, rep.HashMatches, rep.TotalsMatch)
	}
	if rep.Holders != 3 || rep.Supply != 100 || rep.UnitsSnapshotted != 100 {
		t.Errorf("holders/supply/units = %d/%d/%d, want 3/100/100", rep.Holders, rep.Supply, rep.UnitsSnapshotted)
	}
	if want := solana.PublicKey(expectedHash()).String(); rep.ExpectedHash != want || rep.OnchainHash != want {
		t.Errorf("hash = %s / %s, want %s", rep.ExpectedHash, rep.OnchainHash, want)
	}
	if rep.ExpectedTotals.Gross != 500_000 || rep.ActionStatus != "Completed" {
		t.Errorf("totals gross = %d, status %q", rep.ExpectedTotals.Gross, rep.ActionStatus)
	}
	// ATA reads must be pinned to the snapshot slot.
	if fc.gotMinSlot != fc.action.SnapshotSlot {
		t.Errorf("minContextSlot = %d, want %d", fc.gotMinSlot, fc.action.SnapshotSlot)
	}
}

func TestRunFlagsMismatchedEntitlement(t *testing.T) {
	fc := newFixture(t)
	// ownerB's on-chain gross tampered: 125 000 → 124 999.
	fc.entitlements[1].Entitlement.Gross = 124_999
	// and the action total mirrors the tamper so only the holder row is wrong.
	fc.action.TotalGross = 499_999

	rep, err := Run(t.Context(), fc, actionPDA)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if rep.Ok {
		t.Fatal("Ok = true, want false for a tampered entitlement")
	}
	if len(rep.Mismatches) != 1 {
		t.Fatalf("mismatches = %+v, want exactly ownerB", rep.Mismatches)
	}
	m := rep.Mismatches[0]
	if m.Owner != ownerB.String() || m.Reason != ReasonEntitlementMismatch {
		t.Fatalf("mismatch = %+v, want ownerB/%s", m, ReasonEntitlementMismatch)
	}
	if len(m.Fields) != 1 || m.Fields[0] != "gross" {
		t.Errorf("fields = %v, want [gross]", m.Fields)
	}
	if m.Expected.Gross != 125_000 || m.Onchain.Gross != 124_999 {
		t.Errorf("expected/onchain gross = %d/%d", m.Expected.Gross, m.Onchain.Gross)
	}
	// hash covers only owner+units, so it still matches — ok must be false
	// purely from the field mismatch.
	if !rep.HashMatches {
		t.Error("hashMatches = false, want true (units unchanged)")
	}
}

func TestRunFlagsMissingEntitlementAndWrongHash(t *testing.T) {
	fc := newFixture(t)
	// ownerC's entitlement never snapshotted (holder listed as missing)…
	fc.entitlements = fc.entitlements[:2]
	// …and the stored hash is corrupt: it can no longer match the
	// recomputation over the three live balances.
	fc.action.SnapshotHash[0] ^= 0xFF

	rep, err := Run(t.Context(), fc, actionPDA)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if rep.Ok {
		t.Fatal("Ok = true, want false")
	}
	if rep.HashMatches {
		t.Error("hashMatches = true, want false")
	}
	found := false
	for _, m := range rep.Mismatches {
		if m.Owner == ownerC.String() && m.Reason == ReasonMissingEntitlement && m.Expected.Units == 65 {
			found = true
		}
	}
	if !found {
		t.Fatalf("ownerC missing_entitlement not listed: %+v", rep.Mismatches)
	}
}

func TestRunActionNotFound(t *testing.T) {
	fc := newFixture(t)
	fc.action = nil
	if _, err := Run(t.Context(), fc, actionPDA); err != ErrActionNotFound {
		t.Fatalf("err = %v, want ErrActionNotFound", err)
	}
}

// Plan 15 D1'/D3: on a hooked series units come from the entitlements (the ATAs have moved since the snapshot) and
// the hash is the order-independent set hash — XOR of sha256("qupon:snap:v1" ‖ action ‖ owner ‖ units_le).
func TestRunHookedSeriesSetHash(t *testing.T) {
	fc := newFixture(t)
	fc.series.Reserved[0] = 1 // hook
	fc.action.Reserved[0] = 1
	fc.action.HashScheme = 1
	var want [32]byte
	for _, h := range []struct {
		owner solana.PublicKey
		units uint64
	}{{ownerC, 65}, {ownerA, 10}, {ownerB, 25}} { // any order
		buf := append([]byte("qupon:snap:v1"), actionPDA[:]...)
		buf = append(buf, h.owner[:]...)
		buf = append(buf, le(h.units)...)
		leaf := sha256.Sum256(buf)
		for i := range want {
			want[i] ^= leaf[i]
		}
	}
	fc.action.SnapshotHash = want
	// Trading resumed after the snapshot: the ATAs no longer hold the record-date balances.
	for k, ta := range fc.atas {
		fc.atas[k] = &chain.TokenAccount{Mint: ta.Mint, Owner: ta.Owner, Amount: ta.Amount + 7}
	}
	rep, err := Run(t.Context(), fc, actionPDA)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !rep.Ok || !rep.HashMatches {
		t.Fatalf("Ok=%v hashMatches=%v mismatches %+v", rep.Ok, rep.HashMatches, rep.Mismatches)
	}
	if rep.ExpectedTotals.Gross != 500_000 {
		t.Errorf("gross = %d, want 500000", rep.ExpectedTotals.Gross)
	}
}
