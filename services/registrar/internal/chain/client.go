// RPC client for qupon_bonds and Token-2022 accounts: getAccountInfo /
// getProgramAccounts with timeout, retry and discriminator+memcmp filters.
// Never filter by dataSize (docs/04-stack.md: account sizes vary with TLV).
package chain

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
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
		rpc:     rpc.NewWithTimeoutAndCommitment(rpcURL, rpcTimeout, defaultCommitm_),
		program: program,
		log:     log,
	}
}

// AccountDiscriminator returns sha256("account:<Name>")[:8] (Anchor scheme)
// for Series, Investor, CorporateAction, Entitlement.
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
	var out []byte
	err := c.withRetry(ctx, func() error {
		res, err := c.rpc.GetAccountInfoWithOpts(ctx, key,
			&rpc.GetAccountInfoOpts{Commitment: defaultCommitm_})
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
