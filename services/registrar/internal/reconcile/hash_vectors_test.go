package reconcile

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"os"
	"slices"
	"testing"

	solana "github.com/solana-foundation/solana-go/v2"
)

// Shared snapshot-hash vectors exported from the real program run in LiteSVM
// (fixtures/snapshot_hash.json; programs/qupon_bonds/tests/snapshot_hash_fixtures.rs):
// scheme 0 rolls sha256(prev ‖ owner ‖ units_le) over holders sorted owner-ascending,
// scheme 1 XORs the set-hash leaves and is order-independent. Zero-unit holders
// contribute nothing. This test runs the same hash helpers Run uses over every case.
const snapshotHashFixturePath = "../../../../fixtures/snapshot_hash.json"

func TestSnapshotHashVectors(t *testing.T) {
	type holder struct {
		Owner string `json:"owner"`
		Units uint64 `json:"units"`
	}
	type vecHolder struct {
		owner solana.PublicKey
		units uint64
	}
	type vecCase struct {
		ID      string   `json:"id"`
		Scheme  uint8    `json:"scheme"`
		Action  string   `json:"action"`
		Holders []holder `json:"holders"`
		Hash    string   `json:"hash"`
	}
	b, err := os.ReadFile(snapshotHashFixturePath)
	if err != nil {
		t.Fatalf("read %s: %v", snapshotHashFixturePath, err)
	}
	var f struct {
		Cases []vecCase `json:"cases"`
	}
	if err := json.Unmarshal(b, &f); err != nil {
		t.Fatalf("parse %s: %v", snapshotHashFixturePath, err)
	}

	for _, c := range f.Cases {
		t.Run(c.ID, func(t *testing.T) {
			action, err := solana.PublicKeyFromBase58(c.Action)
			if err != nil {
				t.Fatalf("action %q: %v", c.Action, err)
			}
			holders := make([]vecHolder, 0, len(c.Holders))
			for _, h := range c.Holders {
				owner, err := solana.PublicKeyFromBase58(h.Owner)
				if err != nil {
					t.Fatalf("owner %q: %v", h.Owner, err)
				}
				holders = append(holders, vecHolder{owner, h.Units})
			}

			var hash [32]byte
			if c.Scheme == 1 {
				for _, h := range holders {
					if h.units == 0 {
						continue
					}
					xorInto(&hash, SetHashLeaf(action, h.owner, h.units))
				}
			} else {
				// The rolling hash is defined over owners ascending by bytes, like Run sorts.
				slices.SortFunc(holders, func(a, b vecHolder) int {
					return bytes.Compare(a.owner[:], b.owner[:])
				})
				for _, h := range holders {
					if h.units == 0 {
						continue
					}
					hash = hashStep(&hash, h.owner, h.units)
				}
			}

			want, err := hex.DecodeString(c.Hash)
			if err != nil {
				t.Fatalf("hash %q: %v", c.Hash, err)
			}
			if !bytes.Equal(hash[:], want) {
				t.Errorf("%s: hash = %x, want %s", c.ID, hash, c.Hash)
			}
		})
	}
}
