package notice

import (
	"context"
	"errors"
	"fmt"
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

// Reader builds notices from on-chain state over RPC.
type Reader struct {
	rpc        *rpc.Client
	IssuerName string
}

// NewReader creates a Reader for the given RPC endpoint.
func NewReader(rpcURL, issuerName string) *Reader {
	if issuerName == "" {
		issuerName = IssuerNameDefault
	}
	return &Reader{rpc: rpc.New(rpcURL), IssuerName: issuerName}
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

// FetchAction loads the CorporateAction and its Series and assembles notice Data.
func (r *Reader) FetchAction(ctx context.Context, pda solana.PublicKey, lang string) (Data, error) {
	act, err := r.rpc.GetAccountInfoWithOpts(ctx, pda, &rpc.GetAccountInfoOpts{Commitment: rpc.CommitmentConfirmed})
	if err != nil {
		return Data{}, fmt.Errorf("get action account: %w", err)
	}
	if act.Value == nil || act.Value.Owner.String() == "" || len(act.Value.Data.GetBinary()) == 0 {
		return Data{}, ErrActionNotFound
	}
	action, err := chain.DecodeCorporateAction(act.Value.Data.GetBinary())
	if err != nil {
		return Data{}, fmt.Errorf("decode action: %w", err)
	}
	series, err := r.fetchSeries(ctx, action.Series)
	if err != nil {
		return Data{}, err
	}

	d := Data{
		Kind:           Kind(action.Kind),
		Lang:           lang,
		CouponNumber:   int(action.Index) + 1,
		PaymentDate:    date(action.PaymentAt),
		IssuerName:     r.IssuerName,
		ISIN:           fixedString(series.ISIN[:]),
		Ticker:         fixedString(series.Ticker[:]),
		TotalNet:       action.TotalNet,
		Ccy:            "KZT", // ponytail: single settlement currency in demo; derive from cash mint decimals later
		Holders:        int(action.HoldersSnapshotted),
		RecordDate:     date(action.RecordAt),
		NextCouponDate: date(series.NextCouponDate),
		Principal:      uint64(action.UnitsSnapshotted) * action.PerUnitPrincipal,
		FinalCoupon:    action.TotalGross,
		Days:           action.AccrualDays,
		OldRateBps:     series.CouponRateBps,
		NewRateBps:     action.ProposalNewRateBps,
		EffectiveDate:  date(action.PaymentAt),
	}
	// MCAL accrued net per unit, 2-decimal minor units: net × 100 / units.
	if action.UnitsSnapshotted > 0 {
		d.AccruedNetMinor = action.TotalNet * 100 / action.UnitsSnapshotted
	}
	return d, nil
}

func (r *Reader) fetchSeries(ctx context.Context, pk solana.PublicKey) (*chain.Series, error) {
	acc, err := r.rpc.GetAccountInfoWithOpts(ctx, pk, &rpc.GetAccountInfoOpts{Commitment: rpc.CommitmentConfirmed})
	if err != nil {
		return nil, fmt.Errorf("get series account: %w", err)
	}
	if acc.Value == nil || len(acc.Value.Data.GetBinary()) == 0 {
		return nil, fmt.Errorf("series account %s not found", pk)
	}
	s, err := chain.DecodeSeries(acc.Value.Data.GetBinary())
	if err != nil {
		return nil, fmt.Errorf("decode series: %w", err)
	}
	return s, nil
}

// Notice renders the full notice text for an action PDA.
func (r *Reader) Notice(ctx context.Context, pda solana.PublicKey, lang string) (string, error) {
	d, err := r.FetchAction(ctx, pda, lang)
	if err != nil {
		return "", err
	}
	return Render(d)
}
