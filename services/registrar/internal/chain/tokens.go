// Minimal Token / Token-2022 state decoders: bond-ATA balance + frozen flag,
// mint supply + PausableConfig paused flag. Fixed-part offsets follow the SPL
// layouts; TLV extensions are walked but only Pausable (type 26) is read
// (spl-token-2022-interface ExtensionType; the crate the program builds on).
package chain

import (
	"context"
	"encoding/binary"
	"fmt"

	"github.com/qupon-kz/qupon/services/registrar/internal/borsh"
	solana "github.com/solana-foundation/solana-go/v2"
)

const (
	tokenAccountBaseLen = 165 // mint 32 + owner 32 + amount 8 + delegate COption 36 + state 1 + is_native 12 + delegated 8 + close COption 36
	mintBaseLen         = 82  // mint_authority COption 36 + supply 8 + decimals 1 + initialized 1 + freeze_authority COption 36
	stateFrozen         = 2   // Account.state: 0 Uninitialized, 1 Initialized, 2 Frozen, 3 Disabled
	pausableExtType     = 26  // ExtensionType::Pausable (PausableConfig)
	pausablePausedOff   = 36  // OptionalNonZeroPubkey authority, then paused PodBool
)

// TokenAccount is the minimal view of an SPL token account.
type TokenAccount struct {
	Mint   solana.PublicKey
	Owner  solana.PublicKey
	Amount uint64
	Frozen bool // frozen by suspend/record-date or never thawed
}

// DecodeTokenAccount parses the fixed part of a Token/Token-2022 account.
func DecodeTokenAccount(data []byte) (*TokenAccount, error) {
	if len(data) < tokenAccountBaseLen {
		return nil, fmt.Errorf("chain: token account %d bytes, want >= %d", len(data), tokenAccountBaseLen)
	}
	r := borsh.NewReader(data)
	t := &TokenAccount{}
	var err error
	if t.Mint, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("chain: token account mint: %w", err)
	}
	if t.Owner, err = r.Pubkey(); err != nil {
		return nil, fmt.Errorf("chain: token account owner: %w", err)
	}
	if t.Amount, err = r.U64(); err != nil {
		return nil, fmt.Errorf("chain: token account amount: %w", err)
	}
	if _, err := r.Bytes(36); err != nil { // delegate COption
		return nil, fmt.Errorf("chain: token account delegate: %w", err)
	}
	state, err := r.U8()
	if err != nil {
		return nil, fmt.Errorf("chain: token account state: %w", err)
	}
	t.Frozen = state == stateFrozen
	return t, nil
}

// Mint is the minimal view of a Token-2022 mint.
type Mint struct {
	Supply   uint64
	Decimals uint8
	Paused   bool // PausableConfig extension, when present
}

// DecodeMint parses the fixed part of a Token-2022 mint plus the Pausable
// TLV extension. Unknown extensions are skipped; padding/truncated entries
// end the walk instead of failing (older mints carry other extensions).
func DecodeMint(data []byte) (*Mint, error) {
	if len(data) < mintBaseLen {
		return nil, fmt.Errorf("chain: mint %d bytes, want >= %d", len(data), mintBaseLen)
	}
	m := &Mint{
		Supply:   binary.LittleEndian.Uint64(data[36:44]),
		Decimals: data[44],
	}
	off := mintBaseLen
	for off+4 <= len(data) {
		typ := binary.LittleEndian.Uint16(data[off : off+2])
		length := int(binary.LittleEndian.Uint16(data[off+2 : off+4]))
		val := off + 4
		if typ == 0 || val+length > len(data) {
			break // Uninitialized padding or truncated tail
		}
		if typ == pausableExtType && length > pausablePausedOff {
			m.Paused = data[val+pausablePausedOff] == 1
		}
		off = val + length
	}
	return m, nil
}

// FetchTokenAccountAt reads and decodes a token account pinned to minSlot
// (0 = unset); nil if absent.
func (c *Client) FetchTokenAccountAt(ctx context.Context, addr solana.PublicKey, minSlot uint64) (*TokenAccount, error) {
	data, err := c.GetAccountAt(ctx, addr, minSlot)
	if err != nil {
		return nil, fmt.Errorf("fetch token account %s: %w", addr, err)
	}
	if data == nil {
		return nil, nil
	}
	return DecodeTokenAccount(data)
}

// FetchTokenAccount reads and decodes a token account; nil if absent.
func (c *Client) FetchTokenAccount(ctx context.Context, addr solana.PublicKey) (*TokenAccount, error) {
	return c.FetchTokenAccountAt(ctx, addr, 0)
}

// FetchMint reads and decodes a Token-2022 mint; nil if absent.
func (c *Client) FetchMint(ctx context.Context, mint solana.PublicKey) (*Mint, error) {
	data, err := c.GetAccount(ctx, mint)
	if err != nil {
		return nil, fmt.Errorf("fetch mint %s: %w", mint, err)
	}
	if data == nil {
		return nil, nil
	}
	return DecodeMint(data)
}
