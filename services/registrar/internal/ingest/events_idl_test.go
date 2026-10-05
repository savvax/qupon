package ingest

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"testing"
)

// Anchor 1.2 IDL: `events` carries only name+discriminator; the layout lives
// in `types` as a struct with the event's name.
type idlFile struct {
	Events []struct {
		Name string `json:"name"`
	}
	Types []struct {
		Name string `json:"name"`
		Type struct {
			Kind   string `json:"kind"`
			Fields []struct {
				Name string          `json:"name"`
				Type json.RawMessage `json:"type"`
			} `json:"fields"`
		} `json:"type"`
	}
}

// idlKind maps an IDL field type to the Go field kind ("pubkey" -> pk,
// {"array":["u8",16]} -> bytes/16).
func idlKind(raw json.RawMessage) (field, error) {
	var scalar string
	if err := json.Unmarshal(raw, &scalar); err == nil {
		switch scalar {
		case "pubkey":
			return pk(""), nil
		case "u8", "u16", "u32", "u64", "i64", "bool":
			return field{kind: scalar}, nil
		}
		return field{}, fmt.Errorf("unsupported idl type %q", scalar)
	}
	var arr struct {
		Array []json.RawMessage `json:"array"`
	}
	if err := json.Unmarshal(raw, &arr); err != nil || len(arr.Array) != 2 {
		return field{}, fmt.Errorf("unsupported idl type %s", raw)
	}
	var elem string
	if err := json.Unmarshal(arr.Array[0], &elem); err != nil || elem != "u8" {
		return field{}, fmt.Errorf("unsupported idl array element in %s", raw)
	}
	var size int
	if err := json.Unmarshal(arr.Array[1], &size); err != nil {
		return field{}, fmt.Errorf("unsupported idl array size in %s", raw)
	}
	return field{kind: "bytes", n: size}, nil
}

// TestLayoutsMatchIDL diffs the Go layouts table against the generated IDL so
// a program change that forgets the Go decoder fails loudly. Skipped when the
// program has not been built (`anchor build` writes target/idl).
func TestLayoutsMatchIDL(t *testing.T) {
	body, err := os.ReadFile("../../../../target/idl/qupon_bonds.json")
	if errors.Is(err, os.ErrNotExist) {
		t.Skip("target/idl/qupon_bonds.json absent; run anchor build")
	}
	if err != nil {
		t.Fatalf("read idl: %v", err)
	}
	var idl idlFile
	if err := json.Unmarshal(body, &idl); err != nil {
		t.Fatalf("parse idl: %v", err)
	}

	structs := make(map[string][]struct {
		Name string          `json:"name"`
		Type json.RawMessage `json:"type"`
	}, len(idl.Types))
	for _, ty := range idl.Types {
		if ty.Type.Kind == "struct" {
			structs[ty.Name] = ty.Type.Fields
		}
	}
	if len(idl.Events) == 0 {
		t.Fatal("idl has no events")
	}

	seen := make(map[string]bool, len(idl.Events))
	for _, ev := range idl.Events {
		seen[ev.Name] = true
		got, ok := layouts[ev.Name]
		if !ok {
			t.Errorf("event %s: no Go layout", ev.Name)
			continue
		}
		fields, ok := structs[ev.Name]
		if !ok {
			t.Errorf("event %s: no struct type in idl", ev.Name)
			continue
		}
		if len(got) != len(fields) {
			t.Errorf("event %s: %d Go fields, idl has %d", ev.Name, len(got), len(fields))
			continue
		}
		for i, f := range fields {
			want, err := idlKind(f.Type)
			if err != nil {
				t.Fatalf("event %s field %s: %v", ev.Name, f.Name, err)
			}
			if got[i].name != f.Name || got[i].kind != want.kind || got[i].n != want.n {
				t.Errorf("event %s field[%d]: Go (%s %s n=%d), idl (%s %s n=%d)",
					ev.Name, i, got[i].name, got[i].kind, got[i].n, f.Name, want.kind, want.n)
			}
		}
	}
	for name := range layouts {
		if !seen[name] {
			t.Errorf("Go layout %s has no idl event (stale?)", name)
		}
	}
}
