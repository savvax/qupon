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
		Kind: 0, Status: 5, CashMint: cash, PaymentAt: 1_799_089_200, RecordAt: 1_798_916_400, // Completed
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

type fakeActivity struct {
	sigs []string
	err  error
}

func (f fakeActivity) ActionSignatures(context.Context, string) ([]string, error) {
	return f.sigs, f.err
}

func TestReaderTxLinksFromActivity(t *testing.T) {
	pda := solana.PublicKey{4: 4}
	r := NewReader(fakeChain{action: briefINTR(solana.PublicKey{3: 3}), decimals: 2}, "")
	r.Activity = fakeActivity{sigs: []string{"SIGAAA111", "SIGBBB222"}}
	for _, lang := range []string{"en", "ru"} {
		text, err := r.Notice(context.Background(), pda, lang)
		if err != nil {
			t.Fatalf("notice %s: %v", lang, err)
		}
		for _, want := range []string{
			"https://explorer.solana.com/tx/SIGAAA111?cluster=devnet",
			"https://explorer.solana.com/tx/SIGBBB222?cluster=devnet",
		} {
			if !strings.Contains(text, want) {
				t.Errorf("%s notice lacks %q:\n%s", lang, want, text)
			}
		}
		if strings.Contains(text, "TX_SIGNATURE") {
			t.Errorf("%s notice still shows the placeholder:\n%s", lang, text)
		}
	}
}

func TestReaderTxLinksFallback(t *testing.T) {
	pda := solana.PublicKey{4: 4}
	want := "see explorer for action " + pda.String() +
		": https://explorer.solana.com/address/" + pda.String() + "?cluster=devnet"
	for name, act := range map[string]fakeActivity{
		"no source":  {},
		"no sigs":    {sigs: []string{}},
		"feed error": {err: errors.New("boom")},
	} {
		r := NewReader(fakeChain{action: briefINTR(solana.PublicKey{3: 3}), decimals: 2}, "")
		r.Activity = act
		text, err := r.Notice(context.Background(), pda, "en")
		if err != nil {
			t.Fatalf("%s: notice: %v", name, err)
		}
		if !strings.Contains(text, want) {
			t.Errorf("%s: notice lacks fallback %q:\n%s", name, want, text)
		}
	}
}

func TestReaderTxLinksDedupAndCap(t *testing.T) {
	r := NewReader(fakeChain{action: briefINTR(solana.PublicKey{3: 3}), decimals: 2}, "")
	r.Activity = fakeActivity{sigs: []string{"s1", "s1", "s2", "s3", "s4", "s5", "s6"}}
	links := r.txLinks(context.Background(), solana.PublicKey{4: 4})
	want := []string{"s2", "s3", "s4", "s5", "s6"} // deduped, newest 5, oldest first
	if len(links) != len(want) {
		t.Fatalf("links = %v, want %v", links, want)
	}
	for i, sig := range want {
		if links[i] != explorerLink(sig) {
			t.Errorf("links[%d] = %s, want %s", i, links[i], explorerLink(sig))
		}
	}
}

// A payment notice before the payment would state a fact that is not true yet.
func TestReaderRefusesBeforeCompletion(t *testing.T) {
	for _, status := range []uint8{0, 1, 2, 3, 4, 7} {
		a := briefINTR(solana.PublicKey{3: 3})
		a.Status = status
		_, err := NewReader(fakeChain{action: a, decimals: 2}, "").Notice(context.Background(), solana.PublicKey{4: 4}, "en")
		if !errors.Is(err, ErrNotYetSettled) {
			t.Errorf("status %d: err = %v, want ErrNotYetSettled", status, err)
		}
	}
}

// Plan 15 D4: a Defaulted action carries a default notice the moment it is
// declared; once cured, the same action carries a cure notice.
func TestReaderDefaultAndCureNotices(t *testing.T) {
	pda := solana.PublicKey{4: 4}
	a := briefINTR(solana.PublicKey{3: 3})
	a.Status, a.DefaultedAt = 10, 1_799_521_200 // 2027-01-10 Almaty

	text, err := NewReader(fakeChain{action: a, decimals: 2}, "").Notice(context.Background(), pda, "en")
	if err != nil {
		t.Fatalf("default notice: %v", err)
	}
	for _, want := range []string{"is in default", "due 2027-01-05", "/KASE, 2027-01-10/"} {
		if !strings.Contains(text, want) {
			t.Errorf("default notice lacks %q:\n%s", want, text)
		}
	}

	// Cured: status moves past the default, cured_at is set.
	a.Status, a.CuredAt = 5, 1_799_694_000 // 2027-01-12 Almaty
	text, err = NewReader(fakeChain{action: a, decimals: 2}, "").Notice(context.Background(), pda, "ru")
	if err != nil {
		t.Fatalf("cure notice: %v", err)
	}
	for _, want := range []string{"устранил(а) дефолт", "дефолт объявлен 2027-01-10", "/KASE, 2027-01-12/"} {
		if !strings.Contains(text, want) {
			t.Errorf("cure notice lacks %q:\n%s", want, text)
		}
	}
}

func TestReaderPCALAndBMET(t *testing.T) {
	pda := solana.PublicKey{4: 4}
	a := briefINTR(solana.PublicKey{3: 3})
	a.Kind, a.TotalPrincipal = 3, 50_000 // PCAL amortization
	text, err := NewReader(fakeChain{action: a, decimals: 2}, "").Notice(context.Background(), pda, "en")
	if err != nil {
		t.Fatalf("pcal notice: %v", err)
	}
	for _, want := range []string{"partial early redemption", "500.00", "remain listed on KASE"} {
		if !strings.Contains(text, want) {
			t.Errorf("pcal notice lacks %q:\n%s", want, text)
		}
	}

	a.Kind, a.Status, a.Result, a.VotingEndsAt, a.ProposalNewRateBps = 4, 9, 1, 1_799_953_200, 1200 // BMET approved 2027-01-15
	text, err = NewReader(fakeChain{action: a, decimals: 2}, "").Notice(context.Background(), pda, "kk")
	if err != nil {
		t.Fatalf("bmet notice: %v", err)
	}
	for _, want := range []string{"ұстаушылар жиналысы", "мақұлдады", "10.00% → 12.00%"} {
		if !strings.Contains(text, want) {
			t.Errorf("bmet kk notice lacks %q:\n%s", want, text)
		}
	}

	a.Result = 2 // rejected
	text, err = NewReader(fakeChain{action: a, decimals: 2}, "").Notice(context.Background(), pda, "en")
	if err != nil {
		t.Fatalf("bmet rejected notice: %v", err)
	}
	if !strings.Contains(text, "did not approve") || strings.Contains(text, "effective") {
		t.Errorf("bmet rejected notice:\n%s", text)
	}
}

func TestReaderKazakhINTR(t *testing.T) {
	r := NewReader(fakeChain{action: briefINTR(solana.PublicKey{3: 3}), decimals: 2}, "")
	text, err := r.Notice(context.Background(), solana.PublicKey{4: 4}, "kk")
	if err != nil {
		t.Fatalf("kk notice: %v", err)
	}
	for _, want := range []string{"1-ші купонді төледі", "реестрді тіркеу күні: 2027-01-03", "Келесі купон төлемі: 2027-07-03"} {
		if !strings.Contains(text, want) {
			t.Errorf("kk notice lacks %q:\n%s", want, text)
		}
	}
}
