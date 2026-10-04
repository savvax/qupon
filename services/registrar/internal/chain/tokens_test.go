package chain

import (
	"encoding/binary"
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

// pausableExt is a PausableConfig value: 36-byte OptionalNonZeroPubkey
// authority (none) + paused PodBool.
func pausableExt(paused bool) []byte {
	v := make([]byte, 37)
	if paused {
		v[36] = 1
	}
	return tlvEntry(pausableExtType, v)
}

// tokenAccountBytes builds a fixed-layout SPL token account (state at 108)
// followed by optional TLV entries.
func tokenAccountBytes(t *testing.T, state byte, exts ...[]byte) []byte {
	t.Helper()
	data := make([]byte, tokenAccountBaseLen)
	mint := pk(t, "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")
	owner := pk(t, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")
	copy(data[0:32], mint[:])                          // mint
	copy(data[32:64], owner[:])                        // owner
	binary.LittleEndian.PutUint64(data[64:72], 10_000) // amount
	data[108] = state
	for _, e := range exts {
		data = append(data, e...)
	}
	return data
}

// mintBytes builds a fixed-layout Token-2022 mint followed by TLV entries.
func mintBytes(supply uint64, decimals uint8, exts ...[]byte) []byte {
	data := make([]byte, mintBaseLen)
	binary.LittleEndian.PutUint64(data[36:44], supply)
	data[44] = decimals
	for _, e := range exts {
		data = append(data, e...)
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
	tests := []struct {
		name   string
		data   []byte
		paused bool
		supply uint64
		err    bool
	}{
		{"paused", mintBytes(10_000, 0, pausableExt(true)), true, 10_000, false},
		{"resumed", mintBytes(10_000, 0, pausableExt(false)), false, 10_000, false},
		{"no pausable extension", mintBytes(0, 6, metaPtr), false, 0, false},
		{"pausable after other extension", mintBytes(10_000, 0, metaPtr, pausableExt(true)), true, 10_000, false},
		{"truncated TLV tail is ignored", mintBytes(10_000, 0, append(pausableExt(true), 0xFF, 0xFF)), true, 10_000, false},
		{"padding stops the walk", mintBytes(10_000, 0, []byte{0, 0, 4, 0}, pausableExt(true)), false, 10_000, false},
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
