// Liveness probes for GET /admin/system (task 702): single direct RPC calls with no retry —
// the caller's context bounds them (2 s) and a failed probe is data (ok:false), not something to retry.
package chain

import (
	"context"

	solana "github.com/solana-foundation/solana-go/v2"
)

// Slot returns the current slot at the reader's default commitment.
func (c *Client) Slot(ctx context.Context) (uint64, error) {
	return c.rpc.GetSlot(ctx, defaultCommitm_)
}

// Balance returns an account's lamports.
func (c *Client) Balance(ctx context.Context, key solana.PublicKey) (uint64, error) {
	res, err := c.rpc.GetBalance(ctx, key, defaultCommitm_)
	if err != nil {
		return 0, err
	}
	return res.Value, nil
}
