package notice

import (
	"context"
	"errors"
	"strings"
	"testing"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
)

type fakeChain struct {
	action   *chain.CorporateAction
	decimals uint8
}

func (f fakeChain) FetchCorporateAction(context.Context, solana.PublicKey) (*chain.CorporateAction, error) {
	return f.action, nil
}

func (fakeChain) FetchSeries(context.Context, solana.PublicKey) (*chain.Series, error) {
	s := &chain.Series{CouponRateBps: 1000, NextCouponDate: 1_814_554_800} // 2027-07-03
	copy(s.ISIN[:], "KZ2C0QUPON01")
	copy(s.Ticker[:], "QPNb1")
	return s, nil
}

func (f fakeChain) FetchMint(context.Context, solana.PublicKey) (*chain.Mint, error) {
	return &chain.Mint{Decimals: f.decimals}, nil
}

// Brief INTR on chain: 3 holders, 500,000 tiyn net (10/25/65 bonds), tKZT with 2 decimals.
func briefINTR(cash solana.PublicKey) *chain.CorporateAction {
	return &chain.CorporateAction{
		Kind: 0, CashMint: cash, PaymentAt: 1_799_089_200, RecordAt: 1_798_916_400,
		HoldersSnapshotted: 3, TotalNet: 500_000, TotalGross: 500_000, AccrualDays: 180,
	}
}

func TestReaderRendersScaledAmounts(t *testing.T) {
	r := NewReader(fakeChain{action: briefINTR(solana.PublicKey{3: 3}), decimals: 2}, "")
	text, err := r.Notice(context.Background(), solana.PublicKey{4: 4}, "en")
	if err != nil {
		t.Fatalf("notice: %v", err)
	}
	for _, want := range []string{"Amount paid: 5,000.00 tKZT to 3 holders", "KZ2C0QUPON01 (QPNb1)", "as of 2027-01-03", "scheduled for 2027-07-03"} {
		if !strings.Contains(text, want) {
			t.Errorf("notice lacks %q:\n%s", want, text)
		}
	}
}

func TestReaderUSDCAndRedemption(t *testing.T) {
	usdc := solana.MustPublicKeyFromBase58(chain.USDCDevnet)
	a := briefINTR(usdc)
	a.Kind, a.TotalNet, a.TotalPrincipal = 1, 50_000, 10_000_000 // REDM: 0.05 USDC coupon + 10 USDC principal
	text, err := NewReader(fakeChain{action: a, decimals: 6}, "").Notice(context.Background(), solana.PublicKey{4: 4}, "en")
	if err != nil {
		t.Fatalf("notice: %v", err)
	}
	if !strings.Contains(text, "10.000000 USDC") || !strings.Contains(text, "0.050000 USDC") || strings.Contains(text, " KZT") {
		t.Errorf("USDC redemption notice:\n%s", text)
	}
}

func TestReaderMissingAction(t *testing.T) {
	_, err := NewReader(fakeChain{}, "").Notice(context.Background(), solana.PublicKey{4: 4}, "en")
	if !errors.Is(err, ErrActionNotFound) {
		t.Fatalf("err = %v, want ErrActionNotFound", err)
	}
}
