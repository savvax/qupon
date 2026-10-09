// RPC client for qupon_bonds and Token-2022 accounts: getAccountInfo /
// getProgramAccounts with timeout, retry and discriminator+memcmp filters.
// Never filter by dataSize (docs/04-stack.md: account sizes vary with TLV).
package chain

import (
	"bytes"
	"cmp"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/borsh"
	solana "github.com/solana-foundation/solana-go/v2"
	"github.com/solana-foundation/solana-go/v2/rpc"
)

const (
	rpcTimeout      = 30 * time.Second
	rpcAttempts     = 3
	retryBaseWait   = 250 * time.Millisecond
	defaultCommitm_ = rpc.CommitmentConfirmed // Alpenglow: confirmed ≈ finalized
)

// Client reads on-chain accounts over JSON-RPC. Safe for concurrent use.
type Client struct {
	rpc     *rpc.Client
	program solana.PublicKey
	log     *slog.Logger
}

// NewClient builds a chain reader for rpcURL (devnet endpoint) and program.
func NewClient(rpcURL string, program solana.PublicKey, log *slog.Logger) *Client {
	return &Client{
		rpc:     NewRPC(rpcURL, rpcTimeout), // every call passes Commitment: defaultCommitm_ explicitly
		program: program,
		log:     log,
	}
}

// AccountDiscriminator returns sha256("account:<Name>")[:8] (Anchor scheme)
// for Series, Investor, CorporateAction, Entitlement, TradeAdmission.
func AccountDiscriminator(name string) ([8]byte, error) {
	return borsh.AnchorDiscriminator("account", name)
}

// AccountRecord is one row of a program-account scan; Data is the full
// account data including the 8-byte discriminator.
type AccountRecord struct {
	Pubkey solana.PublicKey
	Data   []byte
}

// GetAccount returns the raw account data (discriminator included);
// a missing account yields (nil, nil).
func (c *Client) GetAccount(ctx context.Context, key solana.PublicKey) ([]byte, error) {
	return c.GetAccountAt(ctx, key, 0)
}

// GetAccountAt is GetAccount with minContextSlot: the RPC node answers from
// a bank at or past minSlot (0 = unset), never an older one. This is not a
// historical query — snapshot balances are read as current balances while the
// mint is paused (docs/03-domain.md §4).
func (c *Client) GetAccountAt(ctx context.Context, key solana.PublicKey, minSlot uint64) ([]byte, error) {
	var out []byte
	err := c.withRetry(ctx, func() error {
		opts := &rpc.GetAccountInfoOpts{Commitment: defaultCommitm_}
		if minSlot > 0 {
			opts.MinContextSlot = &minSlot
		}
		res, err := c.rpc.GetAccountInfoWithOpts(ctx, key, opts)
		if err != nil {
			return err
		}
		out = res.Value.Data.GetBinary()
		return nil
	})
	if errors.Is(err, rpc.ErrNotFound) {
		return nil, nil
	}
	return out, err
}

// AccountData is raw account data together with its owner program.
type AccountData struct {
	Data  []byte
	Owner solana.PublicKey
}

// GetAccountWithOwner is GetAccount plus the owning program (nil if absent).
// The cash-asset registry (platform v2 §5.1) needs the owner to tell a Token
// mint from a Token-2022 mint from an account owned by another program.
func (c *Client) GetAccountWithOwner(ctx context.Context, key solana.PublicKey) (*AccountData, error) {
	var out *AccountData
	err := c.withRetry(ctx, func() error {
		res, err := c.rpc.GetAccountInfoWithOpts(ctx, key, &rpc.GetAccountInfoOpts{Commitment: defaultCommitm_})
		if err != nil {
			return err
		}
		out = &AccountData{Data: res.Value.Data.GetBinary(), Owner: res.Value.Owner}
		return nil
	})
	if errors.Is(err, rpc.ErrNotFound) {
		return nil, nil
	}
	return out, err
}

// GetProgramAccounts scans program accounts by Anchor discriminator plus
// optional memcmp filters (ANDed). Discriminator filter sits at offset 0.
func (c *Client) GetProgramAccounts(
	ctx context.Context,
	disc [8]byte,
	memcmp []rpc.RPCFilterMemcmp,
) ([]AccountRecord, error) {
	filters := make([]rpc.RPCFilter, 0, len(memcmp)+1)
	filters = append(filters, rpc.RPCFilter{
		Memcmp: &rpc.RPCFilterMemcmp{Offset: 0, Bytes: solana.Base58(disc[:])},
	})
	for _, m := range memcmp {
		filters = append(filters, rpc.RPCFilter{
			Memcmp: &rpc.RPCFilterMemcmp{Offset: m.Offset, Bytes: m.Bytes},
		})
	}
	var out []AccountRecord
	err := c.withRetry(ctx, func() error {
		res, err := c.rpc.GetProgramAccountsWithOpts(ctx, c.program, &rpc.GetProgramAccountsOpts{
			Filters:    filters,
			Commitment: defaultCommitm_,
		})
		if err != nil {
			return err
		}
		out = make([]AccountRecord, 0, len(res))
		for _, ka := range res {
			out = append(out, AccountRecord{Pubkey: ka.Pubkey, Data: ka.Account.Data.GetBinary()})
		}
		return nil
	})
	return out, err
}

// SeriesRecord pairs a Series account with its PDA.
type SeriesRecord struct {
	PDA    solana.PublicKey
	Series *Series
}

// FetchSeries decodes the Series account at pda; nil if the account is absent.
func (c *Client) FetchSeries(ctx context.Context, pda solana.PublicKey) (*Series, error) {
	data, err := c.GetAccount(ctx, pda)
	if err != nil {
		return nil, fmt.Errorf("fetch series %s: %w", pda, err)
	}
	if data == nil {
		return nil, nil
	}
	body, err := stripDiscriminator(data, "Series")
	if err != nil {
		return nil, fmt.Errorf("fetch series %s: %w", pda, err)
	}
	return DecodeSeries(body)
}

// FetchCorporateAction decodes the CorporateAction at pda; nil if absent.
func (c *Client) FetchCorporateAction(ctx context.Context, pda solana.PublicKey) (*CorporateAction, error) {
	data, err := c.GetAccount(ctx, pda)
	if err != nil {
		return nil, fmt.Errorf("fetch action %s: %w", pda, err)
	}
	if data == nil {
		return nil, nil
	}
	body, err := stripDiscriminator(data, "CorporateAction")
	if err != nil {
		return nil, fmt.Errorf("fetch action %s: %w", pda, err)
	}
	return DecodeCorporateAction(body)
}

// FetchInvestorsBySeries lists a series' Investor accounts sorted by owner
// pubkey ascending (bytes) — the snapshot order (docs/03-domain.md §4).
// memcmp: bump u8 then series pubkey → body offset 1 = absolute offset 9.
func (c *Client) FetchInvestorsBySeries(ctx context.Context, series solana.PublicKey) ([]InvestorRecord, error) {
	recs, err := c.GetProgramAccounts(ctx, mustDiscriminator("Investor"),
		[]rpc.RPCFilterMemcmp{{Offset: 9, Bytes: solana.Base58(series[:])}})
	if err != nil {
		return nil, fmt.Errorf("scan investors of %s: %w", series, err)
	}
	out := make([]InvestorRecord, 0, len(recs))
	for _, rec := range recs {
		body, err := stripDiscriminator(rec.Data, "Investor")
		if err != nil {
			return nil, fmt.Errorf("scan investors %s: %w", rec.Pubkey, err)
		}
		inv, err := DecodeInvestor(body)
		if err != nil {
			return nil, fmt.Errorf("scan investors %s: %w", rec.Pubkey, err)
		}
		out = append(out, InvestorRecord{PDA: rec.Pubkey, Investor: inv})
	}
	sortByInvestorOwner(out)
	return out, nil
}

// FetchTradeAdmissionsBySeries lists a series' TradeAdmission accounts (admitted Solana DvP trades not yet
// released), oldest first. memcmp offset 9 = discriminator + bump, then the series pubkey.
func (c *Client) FetchTradeAdmissionsBySeries(ctx context.Context, series solana.PublicKey) ([]TradeRecord, error) {
	recs, err := c.GetProgramAccounts(ctx, mustDiscriminator("TradeAdmission"),
		[]rpc.RPCFilterMemcmp{{Offset: 9, Bytes: solana.Base58(series[:])}})
	if err != nil {
		return nil, fmt.Errorf("scan trades of %s: %w", series, err)
	}
	out := make([]TradeRecord, 0, len(recs))
	for _, rec := range recs {
		body, err := stripDiscriminator(rec.Data, "TradeAdmission")
		if err != nil {
			return nil, fmt.Errorf("scan trades %s: %w", rec.Pubkey, err)
		}
		t, err := DecodeTradeAdmission(body)
		if err != nil {
			return nil, fmt.Errorf("scan trades %s: %w", rec.Pubkey, err)
		}
		out = append(out, TradeRecord{PDA: rec.Pubkey, Trade: t})
	}
	slices.SortFunc(out, func(a, b TradeRecord) int {
		return cmp.Or(cmp.Compare(a.Trade.AdmittedAt, b.Trade.AdmittedAt), strings.Compare(a.Trade.SwapDvp.String(), b.Trade.SwapDvp.String()))
	})
	return out, nil
}

// FetchEntitlementsByAction lists an action's Entitlement accounts sorted by
// owner pubkey ascending (bytes). memcmp offset 9 = bump u8 + action pubkey.
func (c *Client) FetchEntitlementsByAction(ctx context.Context, action solana.PublicKey) ([]EntitlementRecord, error) {
	recs, err := c.GetProgramAccounts(ctx, mustDiscriminator("Entitlement"),
		[]rpc.RPCFilterMemcmp{{Offset: 9, Bytes: solana.Base58(action[:])}})
	if err != nil {
		return nil, fmt.Errorf("scan entitlements of %s: %w", action, err)
	}
	out := make([]EntitlementRecord, 0, len(recs))
	for _, rec := range recs {
		body, err := stripDiscriminator(rec.Data, "Entitlement")
		if err != nil {
			return nil, fmt.Errorf("scan entitlements %s: %w", rec.Pubkey, err)
		}
		e, err := DecodeEntitlement(body)
		if err != nil {
			return nil, fmt.Errorf("scan entitlements %s: %w", rec.Pubkey, err)
		}
		out = append(out, EntitlementRecord{PDA: rec.Pubkey, Entitlement: e})
	}
	sortByEntitlementOwner(out)
	return out, nil
}

func sortByEntitlementOwner(recs []EntitlementRecord) {
	slices.SortFunc(recs, func(a, b EntitlementRecord) int {
		return bytes.Compare(a.Entitlement.Owner[:], b.Entitlement.Owner[:])
	})
}

func sortByInvestorOwner(recs []InvestorRecord) {
	slices.SortFunc(recs, func(a, b InvestorRecord) int {
		return bytes.Compare(a.Investor.Owner[:], b.Investor.Owner[:])
	})
}

func mustDiscriminator(name string) [8]byte {
	disc, err := AccountDiscriminator(name)
	if err != nil {
		panic(err) // sha256 of a fixed name cannot fail
	}
	return disc
}

// AllSeries scans the program for every Series account (startup index pass).
func (c *Client) AllSeries(ctx context.Context) ([]SeriesRecord, error) {
	disc, err := AccountDiscriminator("Series")
	if err != nil {
		return nil, err
	}
	recs, err := c.GetProgramAccounts(ctx, disc, nil)
	if err != nil {
		return nil, fmt.Errorf("scan series: %w", err)
	}
	out := make([]SeriesRecord, 0, len(recs))
	for _, rec := range recs {
		body, err := stripDiscriminator(rec.Data, "Series")
		if err != nil {
			return nil, fmt.Errorf("scan series %s: %w", rec.Pubkey, err)
		}
		s, err := DecodeSeries(body)
		if err != nil {
			return nil, fmt.Errorf("scan series %s: %w", rec.Pubkey, err)
		}
		out = append(out, SeriesRecord{PDA: rec.Pubkey, Series: s})
	}
	return out, nil
}

// FetchEntitlement decodes the Entitlement at pda; nil if the account is absent.
func (c *Client) FetchEntitlement(ctx context.Context, pda solana.PublicKey) (*Entitlement, error) {
	data, err := c.GetAccount(ctx, pda)
	if err != nil {
		return nil, fmt.Errorf("fetch entitlement %s: %w", pda, err)
	}
	if data == nil {
		return nil, nil
	}
	body, err := stripDiscriminator(data, "Entitlement")
	if err != nil {
		return nil, fmt.Errorf("fetch entitlement %s: %w", pda, err)
	}
	return DecodeEntitlement(body)
}

// ProgramID returns the program the client reads from.
func (c *Client) ProgramID() solana.PublicKey { return c.program }

// stripDiscriminator verifies and removes the 8-byte Anchor discriminator.
func stripDiscriminator(data []byte, name string) ([]byte, error) {
	disc, err := AccountDiscriminator(name)
	if err != nil {
		return nil, err
	}
	if len(data) < 8 || !bytes.Equal(data[:8], disc[:]) {
		return nil, fmt.Errorf("%s: discriminator mismatch", name)
	}
	return data[8:], nil
}

// withRetry re-runs call on transport/RPC errors with linear backoff.
// Not-found and context errors are not retried.
func (c *Client) withRetry(ctx context.Context, call func() error) error {
	var err error
	for attempt := 1; attempt <= rpcAttempts; attempt++ {
		if err = call(); err == nil {
			return nil
		}
		if errors.Is(err, rpc.ErrNotFound) ||
			errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return err
		}
		if attempt == rpcAttempts {
			break
		}
		c.log.Warn("rpc call failed, retrying", "attempt", attempt, "err", err)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(retryBaseWait * time.Duration(attempt)):
		}
	}
	return fmt.Errorf("rpc failed after %d attempts: %w", rpcAttempts, err)
}

// ActionRecord pairs a CorporateAction PDA with its decoded state.
type ActionRecord struct {
	PDA    solana.PublicKey
	Action *CorporateAction
}

// FetchActionsBySeries lists a series' CorporateAction accounts (memcmp on
// CorporateAction.series at offset 9 = discriminator + bump), oldest first.
func (c *Client) FetchActionsBySeries(ctx context.Context, series solana.PublicKey) ([]ActionRecord, error) {
	recs, err := c.GetProgramAccounts(ctx, mustDiscriminator("CorporateAction"),
		[]rpc.RPCFilterMemcmp{{Offset: 9, Bytes: solana.Base58(series[:])}})
	if err != nil {
		return nil, fmt.Errorf("scan actions of %s: %w", series, err)
	}
	out := make([]ActionRecord, 0, len(recs))
	for _, rec := range recs {
		body, err := stripDiscriminator(rec.Data, "CorporateAction")
		if err != nil {
			return nil, fmt.Errorf("scan actions %s: %w", rec.Pubkey, err)
		}
		a, err := DecodeCorporateAction(body)
		if err != nil {
			return nil, fmt.Errorf("scan actions %s: %w", rec.Pubkey, err)
		}
		out = append(out, ActionRecord{PDA: rec.Pubkey, Action: a})
	}
	slices.SortFunc(out, func(a, b ActionRecord) int { return int(a.Action.Index) - int(b.Action.Index) })
	return out, nil
}

// SeriesPDA derives ["series", mint] under the program.
func (c *Client) SeriesPDA(mint solana.PublicKey) (solana.PublicKey, error) {
	pda, _, err := solana.FindProgramAddress([][]byte{[]byte("series"), mint[:]}, c.program)
	return pda, err
}

// USDCDevnet is Circle's devnet USDC mint; any other cash mint is the test tenge (tKZT).
const USDCDevnet = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"

// CashCurrency labels a cash mint for display.
func CashCurrency(mint solana.PublicKey) string {
	if mint.String() == USDCDevnet {
		return "USDC"
	}
	return "tKZT"
}

// FetchPayoutRoutesBySeries returns the payout routes chosen by the series' investors (plan 15 D6). Routes are keyed
// by investor PDA only, so this scans every PayoutRoute and keeps the series' own; holders without a route are absent.
func (c *Client) FetchPayoutRoutesBySeries(ctx context.Context, series solana.PublicKey) ([]PayoutRouteRecord, error) {
	investors, err := c.FetchInvestorsBySeries(ctx, series)
	if err != nil {
		return nil, err
	}
	mine := make(map[solana.PublicKey]bool, len(investors))
	for _, inv := range investors {
		mine[inv.PDA] = true
	}
	disc, err := AccountDiscriminator("PayoutRoute")
	if err != nil {
		return nil, err
	}
	recs, err := c.GetProgramAccounts(ctx, disc, nil)
	if err != nil {
		return nil, fmt.Errorf("scan payout routes: %w", err)
	}
	out := make([]PayoutRouteRecord, 0, len(recs))
	for _, rec := range recs {
		p, err := DecodePayoutRoute(rec.Data[8:])
		if err != nil {
			return nil, fmt.Errorf("decode payout route %s: %w", rec.Pubkey, err)
		}
		if mine[p.Investor] {
			out = append(out, PayoutRouteRecord{PDA: rec.Pubkey, Route: p})
		}
	}
	return out, nil
}

// PayoutRoutePDA derives ["route", investor] under the program (plan 15 D6).
func (c *Client) PayoutRoutePDA(investor solana.PublicKey) (solana.PublicKey, error) {
	pda, _, err := solana.FindProgramAddress([][]byte{[]byte("route"), investor[:]}, c.program)
	return pda, err
}

// FetchPayoutRoute decodes the investor's PayoutRoute account; nil when the holder never set one
// (payouts then go to the registered wallet cash account).
func (c *Client) FetchPayoutRoute(ctx context.Context, investor solana.PublicKey) (*PayoutRoute, error) {
	pda, err := c.PayoutRoutePDA(investor)
	if err != nil {
		return nil, err
	}
	data, err := c.GetAccount(ctx, pda)
	if err != nil {
		return nil, fmt.Errorf("fetch payout route %s: %w", pda, err)
	}
	if data == nil {
		return nil, nil
	}
	body, err := stripDiscriminator(data, "PayoutRoute")
	if err != nil {
		return nil, fmt.Errorf("fetch payout route %s: %w", pda, err)
	}
	return DecodePayoutRoute(body)
}

// FetchInvestorsByOwner lists an owner's Investor accounts across every series (public holder lookup,
// task 1525), sorted by series pubkey ascending. memcmp offset 41 = discriminator + bump + series.
func (c *Client) FetchInvestorsByOwner(ctx context.Context, owner solana.PublicKey) ([]InvestorRecord, error) {
	recs, err := c.GetProgramAccounts(ctx, mustDiscriminator("Investor"),
		[]rpc.RPCFilterMemcmp{{Offset: 41, Bytes: solana.Base58(owner[:])}})
	if err != nil {
		return nil, fmt.Errorf("scan investors of %s: %w", owner, err)
	}
	out := make([]InvestorRecord, 0, len(recs))
	for _, rec := range recs {
		body, err := stripDiscriminator(rec.Data, "Investor")
		if err != nil {
			return nil, fmt.Errorf("scan investors %s: %w", rec.Pubkey, err)
		}
		inv, err := DecodeInvestor(body)
		if err != nil {
			return nil, fmt.Errorf("scan investors %s: %w", rec.Pubkey, err)
		}
		out = append(out, InvestorRecord{PDA: rec.Pubkey, Investor: inv})
	}
	slices.SortFunc(out, func(a, b InvestorRecord) int { return bytes.Compare(a.Investor.Series[:], b.Investor.Series[:]) })
	return out, nil
}

// FetchEntitlementsByOwner lists an owner's Entitlement accounts across every action (public holder
// lookup, task 1525), sorted by action pubkey ascending. memcmp offset 41 = discriminator + bump + action.
func (c *Client) FetchEntitlementsByOwner(ctx context.Context, owner solana.PublicKey) ([]EntitlementRecord, error) {
	recs, err := c.GetProgramAccounts(ctx, mustDiscriminator("Entitlement"),
		[]rpc.RPCFilterMemcmp{{Offset: 41, Bytes: solana.Base58(owner[:])}})
	if err != nil {
		return nil, fmt.Errorf("scan entitlements of %s: %w", owner, err)
	}
	out := make([]EntitlementRecord, 0, len(recs))
	for _, rec := range recs {
		body, err := stripDiscriminator(rec.Data, "Entitlement")
		if err != nil {
			return nil, fmt.Errorf("scan entitlements %s: %w", rec.Pubkey, err)
		}
		e, err := DecodeEntitlement(body)
		if err != nil {
			return nil, fmt.Errorf("scan entitlements %s: %w", rec.Pubkey, err)
		}
		out = append(out, EntitlementRecord{PDA: rec.Pubkey, Entitlement: e})
	}
	slices.SortFunc(out, func(a, b EntitlementRecord) int {
		return bytes.Compare(a.Entitlement.Action[:], b.Entitlement.Action[:])
	})
	return out, nil
}
