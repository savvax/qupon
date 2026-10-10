package notice

import (
	"context"
	"errors"
	"fmt"
	"github.com/qupon-kz/qupon/services/registrar/internal/network"
	"log/slog"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"
	"github.com/solana-foundation/solana-go/v2/rpc"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
)

// almaty is the Kazakhstan market timezone for date rendering.
var almaty = time.FixedZone("ALMT", 5*3600)

// IssuerNameDefault is the demo issuer name used when not configured.
// ponytail: single demo issuer; wire per-series issuer names from the registry if multi-issuer is needed.
const IssuerNameDefault = "Qupon Issuer Demo"

// ErrActionNotFound is returned when the action PDA has no on-chain account.
var ErrActionNotFound = errors.New("notice: action account not found")

// ErrNotYetSettled: the notice reports a completed payment or an approved terms change; before that there is no
// fact to publish (statuses Completed 5, Retiring 6 and meeting Finalized 9 qualify).
var ErrNotYetSettled = errors.New("the KASE notice is issued once the action is completed (payment made / meeting finalized)")

// Chain is what the notice needs from the chain; *chain.Client implements it (discriminators verified and
// stripped there; a missing account comes back as nil).
type Chain interface {
	FetchCorporateAction(ctx context.Context, pda solana.PublicKey) (*chain.CorporateAction, error)
	FetchSeries(ctx context.Context, pda solana.PublicKey) (*chain.Series, error)
	FetchMint(ctx context.Context, mint solana.PublicKey) (*chain.Mint, error)
}

// Activity supplies the settlement transaction signatures recorded for an
// action in the activity feed (EntitlementPaid / ActionCompleted events);
// *store.Store implements it. Optional: nil keeps the placeholder link.
type Activity interface {
	ActionSignatures(ctx context.Context, pda string) ([]string, error)
}

// Reader builds notices from on-chain state.
type Reader struct {
	chain Chain
	// Activity, when set, supplies the action's settlement signatures for the
	// notice tx links (nil keeps the placeholder; see txLinks).
	Activity   Activity
	IssuerName string
	// Symbol, when set, names the cash asset from the registry (KZTE, dKZT, …); nil keeps tKZT/USDC.
	Symbol func(ctx context.Context, mint string) (string, bool)
}

// NewReader creates a Reader over the chain client.
func NewReader(c Chain, issuerName string) *Reader {
	if issuerName == "" {
		issuerName = IssuerNameDefault
	}
	return &Reader{chain: c, IssuerName: issuerName}
}

func date(unix int64) string { return time.Unix(unix, 0).In(almaty).Format("2006-01-02") }

func fixedString(b []byte) string {
	for i, c := range b {
		if c == 0 {
			return string(b[:i])
		}
	}
	return string(b)
}

// FetchAction loads the CorporateAction, its Series and cash mint and assembles notice Data.
func (r *Reader) FetchAction(ctx context.Context, pda solana.PublicKey, lang string) (Data, error) {
	action, err := r.chain.FetchCorporateAction(ctx, pda)
	if errors.Is(err, rpc.ErrNotFound) || (err == nil && action == nil) {
		return Data{}, ErrActionNotFound
	}
	if err != nil {
		return Data{}, fmt.Errorf("fetch action: %w", err)
	}
	series, err := r.chain.FetchSeries(ctx, action.Series)
	if err != nil {
		return Data{}, fmt.Errorf("fetch series: %w", err)
	}
	if series == nil {
		return Data{}, fmt.Errorf("series account %s not found", action.Series)
	}
	mint, err := r.chain.FetchMint(ctx, action.CashMint)
	if err != nil {
		return Data{}, fmt.Errorf("fetch cash mint: %w", err)
	}
	if mint == nil {
		return Data{}, fmt.Errorf("cash mint %s not found", action.CashMint)
	}

	// Default & cure notices (plan 15 D4) exist the moment the fact is on chain;
	// every other notice reports a completed payment or a concluded meeting.
	kind := Kind(action.Kind)
	switch {
	case action.Status == 10:
		kind = KindDEFAULT
	case action.DefaultedAt != 0 && action.CuredAt != 0:
		kind = KindCURE
	case action.Status != 5 && action.Status != 6 && action.Status != 9:
		return Data{}, ErrNotYetSettled
	}
	d := Data{
		Kind:           kind,
		Lang:           lang,
		CouponNumber:   int(action.Index) + 1,
		PaymentDate:    date(action.PaymentAt),
		IssuerName:     r.IssuerName,
		ISIN:           fixedString(series.ISIN[:]),
		Ticker:         fixedString(series.Ticker[:]),
		TotalNet:       action.TotalNet,
		Ccy:            r.currency(ctx, action.CashMint),
		Decimals:       mint.Decimals,
		Holders:        int(action.HoldersSnapshotted),
		RecordDate:     date(action.RecordAt),
		NextCouponDate: date(series.NextCouponDate),
		Principal:      action.TotalPrincipal,
		FinalCoupon:    action.TotalNet, // coupon part actually paid (net of withholding)
		Days:           action.AccrualDays,
		OldRateBps:     series.CouponRateBps,
		NewRateBps:     action.ProposalNewRateBps,
		EffectiveDate:  date(action.PaymentAt),
		MeetingDate:    date(action.VotingEndsAt),
		Approved:       action.Result == 1,
		DueDate:        date(action.PaymentAt),
		DefaultDate:    date(action.DefaultedAt),
		CureDate:       date(action.CuredAt),
	}
	// MCAL accrued coupon (total, net of tax) rendered with 2 decimals.
	d.AccruedNetMinor = action.TotalNet
	for range max(int(mint.Decimals)-2, 0) {
		d.AccruedNetMinor /= 10
	}
	d.TxLinks = r.txLinks(ctx, pda)
	return d, nil
}

// maxTxLinks caps the notice at five settlement links; with more signatures
// the newest five win (the final payments matter most in the headline).
const maxTxLinks = 5

// txLinks resolves the settlement signatures for an action from the activity
// feed: deduplicated, newest last, capped at maxTxLinks. When nothing is
// known yet (no feed wired, feed error or no events) it falls back to the
// action's explorer page — the feed is best-effort and never fails a notice.
func (r *Reader) txLinks(ctx context.Context, pda solana.PublicKey) []string {
	var sigs []string
	if r.Activity != nil {
		var err error
		sigs, err = r.Activity.ActionSignatures(ctx, pda.String())
		if err != nil {
			slog.Warn("notice: action signatures unavailable", "pda", pda.String(), "err", err)
			sigs = nil
		}
	}
	seen := make(map[string]bool, len(sigs))
	links := make([]string, 0, min(len(sigs), maxTxLinks))
	for _, sig := range sigs {
		if seen[sig] {
			continue
		}
		seen[sig] = true
		links = append(links, explorerLink(sig))
	}
	if len(links) > maxTxLinks {
		links = links[len(links)-maxTxLinks:]
	}
	if len(links) == 0 {
		links = append(links, "see explorer for action "+pda.String()+
			": "+network.ExplorerURL("address", pda.String()))
	}
	return links
}

// Notice renders the full notice text for an action PDA.
func (r *Reader) Notice(ctx context.Context, pda solana.PublicKey, lang string) (string, error) {
	d, err := r.FetchAction(ctx, pda, lang)
	if err != nil {
		return "", err
	}
	return Render(d)
}

func (r *Reader) currency(ctx context.Context, mint solana.PublicKey) string {
	if r.Symbol != nil {
		if sym, ok := r.Symbol(ctx, mint.String()); ok {
			return sym
		}
	}
	return chain.CashCurrency(mint)
}
