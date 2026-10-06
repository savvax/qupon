// Package assets verifies cash-asset mint accounts on-chain (platform v2 §5.1):
// an admin adds an asset by mint address, the registry reads decimals, token
// program and authorities from the account itself and stores the asset
// disabled until the admin confirms it. Assets are identified by mint address
// — never by ticker (impostor tokens reuse tickers such as KZTE).
package assets

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"strconv"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	solana "github.com/solana-foundation/solana-go/v2"
)

// Token program ids that may own a mint account (docs/04-stack.md).
const (
	TokenProgram     = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" // classic SPL Token
	Token2022Program = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" // Token-2022
)

var (
	// ErrNotMint: the account exists but is not a mint (e.g. a token account) or is absent.
	ErrNotMint = errors.New("assets: account is not a mint")
	// ErrUnknownProgram: the account is owned by a program other than Token / Token-2022.
	ErrUnknownProgram = errors.New("assets: account owner is neither token program")
)

// MintInfo is the verified on-chain state of a mint.
type MintInfo struct {
	Mint            string
	TokenProgram    string
	Decimals        uint8
	Supply          string
	MintAuthority   *string
	FreezeAuthority *string
}

const (
	mintFixedLen    = 82  // mint_authority COption 36 + supply 8 + decimals 1 + initialized 1 + freeze_authority COption 36
	accountTypeOff  = 165 // Token-2022: fixed part padded to 165, byte 165 is AccountType
	accountTypeMint = 1   // AccountType::Mint (2 = Account); same layout as chain.DecodeMint
)

// VerifyMint reads the mint account at addr on the client's network and
// returns its on-chain facts. The account owner decides the token program;
// the data layout decides mint vs token account. A freeze or mint authority
// is reported, not rejected — the admin confirms it when enabling.
func VerifyMint(ctx context.Context, c *chain.Client, mint solana.PublicKey) (MintInfo, error) {
	acc, err := c.GetAccountWithOwner(ctx, mint)
	if err != nil {
		return MintInfo{}, fmt.Errorf("assets: fetch mint %s: %w", mint, err)
	}
	if acc == nil {
		return MintInfo{}, ErrNotMint
	}
	switch owner := acc.Owner.String(); owner {
	case TokenProgram:
		// A classic SPL mint is exactly 82 bytes; a token account is 165.
		if len(acc.Data) != mintFixedLen {
			return MintInfo{}, ErrNotMint
		}
		return decodeMint(mint, acc.Data, owner)
	case Token2022Program:
		// Token-2022 mints without extensions are 82 bytes like classic ones;
		// with extensions the fixed part is padded to 165 and byte 165 is
		// AccountType (1 = Mint, 2 = Account). Anything else is a token account.
		if len(acc.Data) == mintFixedLen ||
			(len(acc.Data) > accountTypeOff && acc.Data[accountTypeOff] == accountTypeMint) {
			return decodeMint(mint, acc.Data, owner)
		}
		return MintInfo{}, ErrNotMint
	default:
		return MintInfo{}, fmt.Errorf("%w: %s", ErrUnknownProgram, owner)
	}
}

// decodeMint reads the fixed mint layout shared by Token and Token-2022:
// COption authorities (u32 tag + optional pubkey), u64 supply, u8 decimals.
func decodeMint(mint solana.PublicKey, data []byte, program string) (MintInfo, error) {
	if len(data) < mintFixedLen {
		return MintInfo{}, ErrNotMint
	}
	if data[45] != 1 {
		// is_initialized flag: an uninitialised mint cannot hold tokens (task 9700)
		return MintInfo{}, ErrNotMint
	}
	info := MintInfo{
		Mint:         mint.String(),
		TokenProgram: program,
		Supply:       strconv.FormatUint(binary.LittleEndian.Uint64(data[36:44]), 10),
		Decimals:     data[44],
	}
	if a, ok := coptionPubkey(data[0:36]); ok {
		info.MintAuthority = &a
	}
	if f, ok := coptionPubkey(data[46:mintFixedLen]); ok {
		info.FreezeAuthority = &f
	}
	return info, nil
}

// coptionPubkey reads an SPL COption<Pubkey>: u32 little-endian tag (1 = Some)
// followed by 32 bytes when set.
func coptionPubkey(b []byte) (string, bool) {
	if binary.LittleEndian.Uint32(b[:4]) != 1 {
		return "", false
	}
	var k solana.PublicKey
	copy(k[:], b[4:36])
	return k.String(), true
}
