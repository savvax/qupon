package network

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFromConfig(t *testing.T) {
	cases := []struct {
		json, name, explorer string
		mainnet, wantErr     bool
	}{
		{`{"cluster":"devnet","programId":"P"}`, "devnet", "devnet", false, false},
		{`{"cluster":"mainnet-beta","programId":"P"}`, "mainnet-beta", "", true, false},
		{`{"cluster":"testnet","programId":"P"}`, "", "", false, true},
		{`not json`, "", "", false, true},
	}
	for _, c := range cases {
		path := filepath.Join(t.TempDir(), "c.json")
		if err := os.WriteFile(path, []byte(c.json), 0o600); err != nil {
			t.Fatal(err)
		}
		p, err := FromConfig(path)
		if (err != nil) != c.wantErr {
			t.Fatalf("%s: err = %v", c.json, err)
		}
		if err == nil && (p.Name != c.name || p.ExplorerCluster != c.explorer || p.Mainnet != c.mainnet || p.ProgramID != "P") {
			t.Fatalf("%s: profile = %+v", c.json, p)
		}
	}
	if _, err := FromConfig(filepath.Join(t.TempDir(), "missing.json")); err == nil {
		t.Fatal("missing file accepted")
	}
}
