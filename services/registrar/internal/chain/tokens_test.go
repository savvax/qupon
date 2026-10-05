package chain

import (
	"encoding/binary"
	"encoding/hex"
	"testing"

	solana "github.com/solana-foundation/solana-go/v2"
)

// tlvEntry builds one Token-2022 TLV extension record (u16 type, u16 len).
func tlvEntry(typ uint16, value []byte) []byte {
	hdr := make([]byte, 4)
	binary.LittleEndian.PutUint16(hdr, typ)
	binary.LittleEndian.PutUint16(hdr[2:], uint16(len(value)))
	return append(hdr, value...)
}

// pausableExt is a PausableConfig value: 32-byte OptionalNonZeroPubkey
// authority (none) + paused PodBool.
func pausableExt(paused bool) []byte {
	v := make([]byte, pausableValueLen)
	if paused {
		v[pausablePausedOff] = 1
	}
	return tlvEntry(pausableExtType, v)
}

// tokenAccountBytes builds a fixed-layout SPL token account (state at 108)
// followed by AccountType (2 = Account) and optional TLV entries, as a
// Token-2022 account with extensions lays them out.
func tokenAccountBytes(t *testing.T, state byte, exts ...[]byte) []byte {
	t.Helper()
	data := make([]byte, tokenAccountBaseLen)
	mint := pk(t, "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")
	owner := pk(t, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")
	copy(data[0:32], mint[:])                          // mint
	copy(data[32:64], owner[:])                        // owner
	binary.LittleEndian.PutUint64(data[64:72], 10_000) // amount
	data[108] = state
	data = append(data, 2) // AccountType: Account
	for _, e := range exts {
		data = append(data, e...)
	}
	return data
}

// mintBytes builds a real-layout Token-2022 mint: 82-byte fixed part when
// there are no extensions, otherwise padded to 165 bytes, AccountType
// (1 = Mint) at 165, then TLV entries at 166.
func mintBytes(supply uint64, decimals uint8, exts ...[]byte) []byte {
	data := make([]byte, mintBaseLen)
	binary.LittleEndian.PutUint64(data[36:44], supply)
	data[44] = decimals
	if len(exts) > 0 {
		data = append(data, make([]byte, accountTypeOff-len(data))...)
		data = append(data, accountTypeMint)
		for _, e := range exts {
			data = append(data, e...)
		}
	}
	return data
}

func TestDecodeTokenAccount(t *testing.T) {
	tests := []struct {
		name   string
		data   []byte
		frozen bool
		err    bool
	}{
		{"thawed", tokenAccountBytes(t, 1), false, false},
		{"frozen", tokenAccountBytes(t, stateFrozen), true, false},
		{"frozen with TLV tail", tokenAccountBytes(t, stateFrozen, tlvEntry(14, nil)), true, false}, // ImmutableOwner
		{"disabled counts as not frozen", tokenAccountBytes(t, 3), false, false},
		{"uninitialized state", tokenAccountBytes(t, 0), false, false},
		{"too short", tokenAccountBytes(t, 1)[:164], false, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			acc, err := DecodeTokenAccount(tc.data)
			if tc.err {
				if err == nil {
					t.Fatal("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("DecodeTokenAccount: %v", err)
			}
			if acc.Frozen != tc.frozen {
				t.Errorf("frozen = %v, want %v", acc.Frozen, tc.frozen)
			}
			if acc.Amount != 10_000 {
				t.Errorf("amount = %d, want 10000", acc.Amount)
			}
			if want := (solana.PublicKey)(pk(t, "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")); acc.Mint != want {
				t.Errorf("mint = %s", acc.Mint)
			}
		})
	}
}

func TestDecodeMint(t *testing.T) {
	metaPtr := tlvEntry(18, make([]byte, 32)) // MetadataPointer before Pausable
	accountNotMint := mintBytes(10_000, 0, pausableExt(true))
	accountNotMint[accountTypeOff] = 2 // AccountType::Account, not a mint
	tests := []struct {
		name   string
		data   []byte
		paused bool
		supply uint64
		err    bool
	}{
		{"paused", mintBytes(10_000, 0, pausableExt(true)), true, 10_000, false},
		{"resumed", mintBytes(10_000, 0, pausableExt(false)), false, 10_000, false},
		{"no extensions", mintBytes(0, 6), false, 0, false},
		{"no pausable extension", mintBytes(0, 6, metaPtr), false, 0, false},
		{"pausable after other extension", mintBytes(10_000, 0, metaPtr, pausableExt(true)), true, 10_000, false},
		{"truncated TLV tail is ignored", mintBytes(10_000, 0, append(pausableExt(true), 0xFF, 0xFF)), true, 10_000, false},
		{"padding stops the walk", mintBytes(10_000, 0, []byte{0, 0, 4, 0}, pausableExt(true)), false, 10_000, false},
		{"account type not mint", accountNotMint, false, 10_000, false},
		{"too short", mintBytes(0, 0)[:81], false, 0, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			m, err := DecodeMint(tc.data)
			if tc.err {
				if err == nil {
					t.Fatal("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("DecodeMint: %v", err)
			}
			if m.Paused != tc.paused {
				t.Errorf("paused = %v, want %v", m.Paused, tc.paused)
			}
			if m.Supply != tc.supply {
				t.Errorf("supply = %d, want %d", m.Supply, tc.supply)
			}
		})
	}
}

// devnetMintHex is the raw account data of the QPNb1 bond mint
// 6KPAMhmAZ25A62PvXSUjvLHiiqxu3hS7ey5CJB2zmtj2 (dumped with
// `solana account <mint> --output json -u devnet`), created by
// clients/ts/scripts/create-bond-mint.ts. 651 bytes: fixed part padded to
// 165, AccountType 1 at 165, then TLV entries MetadataPointer(18),
// 12, Pausable(26) at 270, MintCloseAuthority(3), DefaultAccountState(6),
// TokenMetadata(19).
const devnetMintHex = "01000000502caecd7770bd315b6be63820fe1afb99db5b4b7df134bea6296f4958407cb90000000000000000000101000000502caecd7770bd315b6be63820fe1afb99db5b4b7df134bea6296f4958407cb900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000112004000a0524ca36516bc0ab0bf7ab7cd41841222e5ea96876fa6304475fae1a0ebb54a4efff2744b7ddd7b0c3ccaf5b1511e50ed4042f242bae2285e573babc463b0c10c002000502caecd7770bd315b6be63820fe1afb99db5b4b7df134bea6296f4958407cb91a002100502caecd7770bd315b6be63820fe1afb99db5b4b7df134bea6296f4958407cb90003002000502caecd7770bd315b6be63820fe1afb99db5b4b7df134bea6296f4958407cb9060001000213002b01a0524ca36516bc0ab0bf7ab7cd41841222e5ea96876fa6304475fae1a0ebb54a4efff2744b7ddd7b0c3ccaf5b1511e50ed4042f242bae2285e573babc463b0c1100000005175706f6e20426f6e642051504e62310500000051504e62312000000068747470733a2f2f7175706f6e2e6578616d706c652f51504e62312e6a736f6e07000000040000006973696e0c0000004b5a3243305155504f4e30310a000000666163655f76616c7565060000003130303030300f000000636f75706f6e5f726174655f6270730400000031303030090000006672657175656e63790100000032090000006461795f636f756e740a0000005448495254595f333630080000006d617475726974790a000000323032382d31302d30350600000073746174757306000000414354495645"

func TestDecodeMintDevnetBytes(t *testing.T) {
	data, err := hex.DecodeString(devnetMintHex)
	if err != nil {
		t.Fatalf("hex decode: %v", err)
	}
	if len(data) != 651 {
		t.Fatalf("len = %d, want 651 (dump snapshot)", len(data))
	}
	m, err := DecodeMint(data)
	if err != nil {
		t.Fatalf("DecodeMint: %v", err)
	}
	if m.Supply != 0 || m.Decimals != 0 {
		t.Errorf("supply/decimals = %d/%d, want 0/0", m.Supply, m.Decimals)
	}
	if m.Paused {
		t.Error("paused = true, want false (mint was live at dump time)")
	}
	// Pausable TLV entry header at 270, value at 274, paused PodBool at 274+32.
	data[306] = 1
	m, err = DecodeMint(data)
	if err != nil {
		t.Fatalf("DecodeMint paused: %v", err)
	}
	if !m.Paused {
		t.Error("paused = false, want true after setting the paused byte")
	}
}
