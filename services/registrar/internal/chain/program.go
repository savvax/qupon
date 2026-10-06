package chain

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"

	solana "github.com/solana-foundation/solana-go/v2"
	"github.com/solana-foundation/solana-go/v2/rpc"
)

// bpfUpgradeableLoader owns every upgradeable program (and its ProgramData account).
var bpfUpgradeableLoader = solana.MustPublicKeyFromBase58("BPFLoaderUpgradeab1e11111111111111111111111")

// ProgramStatus is what the admin network page shows about the deployed qupon_bonds program.
type ProgramStatus struct {
	Deployed         bool    `json:"deployed"`
	Executable       bool    `json:"executable"`
	Upgradeable      bool    `json:"upgradeable"`
	ProgramData      string  `json:"programData,omitempty"`
	UpgradeAuthority *string `json:"upgradeAuthority"` // nil = immutable (or not upgradeable)
}

// parseProgramAccount reads UpgradeableLoaderState::Program { programdata_address } (tag 2).
func parseProgramAccount(b []byte) (solana.PublicKey, error) {
	if len(b) < 36 || binary.LittleEndian.Uint32(b[:4]) != 2 {
		return solana.PublicKey{}, errors.New("not an upgradeable Program account")
	}
	return solana.PublicKeyFromBytes(b[4:36]), nil
}

// parseProgramData reads UpgradeableLoaderState::ProgramData { slot, upgrade_authority_address: Option<Pubkey> } (tag 3).
func parseProgramData(b []byte) (*string, error) {
	if len(b) < 13 || binary.LittleEndian.Uint32(b[:4]) != 3 {
		return nil, errors.New("not a ProgramData account")
	}
	if b[12] == 0 {
		return nil, nil
	}
	if len(b) < 45 {
		return nil, errors.New("short ProgramData account")
	}
	a := solana.PublicKeyFromBytes(b[13:45]).String()
	return &a, nil
}

// ProgramStatus inspects the program account and, for upgradeable programs, its upgrade authority.
func (c *Client) ProgramStatus(ctx context.Context) (ProgramStatus, error) {
	var st ProgramStatus
	acct, err := c.rpc.GetAccountInfoWithOpts(ctx, c.program,
		&rpc.GetAccountInfoOpts{Commitment: defaultCommitm_, Encoding: solana.EncodingBase64})
	if errors.Is(err, rpc.ErrNotFound) {
		return st, nil
	} else if err != nil {
		return st, fmt.Errorf("program account: %w", err)
	}
	st.Deployed = true
	st.Executable = acct.Value.Executable
	if !acct.Value.Owner.Equals(bpfUpgradeableLoader) {
		return st, nil
	}
	pd, err := parseProgramAccount(acct.Value.Data.GetBinary())
	if err != nil {
		return st, err
	}
	st.Upgradeable, st.ProgramData = true, pd.String()
	data, err := c.GetAccount(ctx, pd)
	if err != nil {
		return st, fmt.Errorf("program data: %w", err)
	}
	st.UpgradeAuthority, err = parseProgramData(data)
	return st, err
}
