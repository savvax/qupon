package execconfig

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

func TestWriteMergesRegistryIntoBase(t *testing.T) {
	dir := t.TempDir()
	base := filepath.Join(dir, "base.json")
	if err := os.WriteFile(base, []byte(`{"programId":"P","series":{"QPNb1":{"mint":"","isin":"KZ2C0QUPON01"}}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(dir, "out.json")
	rows := []store.RegistryRow{{Name: "QPN2", Mint: "M2", Terms: json.RawMessage(`{"isin":"KZ2C0QUPON02","faceValue":100000}`)}}
	if err := Write(base, out, rows); err != nil {
		t.Fatal(err)
	}
	var got struct {
		ProgramID string                    `json:"programId"`
		Series    map[string]map[string]any `json:"series"`
	}
	b, _ := os.ReadFile(out)
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatal(err)
	}
	if got.ProgramID != "P" || got.Series["QPN2"]["mint"] != "M2" || got.Series["QPN2"]["isin"] != "KZ2C0QUPON02" || got.Series["QPNb1"] == nil {
		t.Fatalf("merged config = %+v", got)
	}
	if _, err := os.Stat(out + ".lock"); !os.IsNotExist(err) {
		t.Fatal("lock file left behind")
	}
}

// TestWritePrecedence pins the task 91562 rules: a stale registry row must not shadow the base
// config's mint, and a placeholder row (mint "") must never drop a live mint the base or the CLI
// already wrote. Each case writes base + current outPath, runs one registry row, checks the mint.
func TestWritePrecedence(t *testing.T) {
	cases := []struct {
		desc     string
		base     string            // base config JSON (programId P implied)
		current  string            // current outPath series map (nil → no file)
		row      store.RegistryRow // the rewrite's registry row
		wantMint string
		wantIsin string // "" → don't check
	}{
		{
			desc:     "registry row overrides base when base mint is empty",
			base:     `{"QPNb1":{"mint":"","isin":"OLD"}}`,
			row:      store.RegistryRow{Name: "QPNb1", Mint: "M2", Terms: json.RawMessage(`{"isin":"NEW"}`)},
			wantMint: "M2", wantIsin: "NEW",
		},
		{
			desc:     "base mint wins over a different registry mint (stale Almaty-Power row)",
			base:     `{"Almaty-Power":{"mint":"5tww","isin":"CURATED"}}`,
			row:      store.RegistryRow{Name: "Almaty-Power", Mint: "Bs27", Terms: json.RawMessage(`{"isin":"STALE"}`)},
			wantMint: "5tww", wantIsin: "CURATED",
		},
		{
			desc:     "same mint in base and registry: registry terms pass through",
			base:     `{"QPNb1":{"mint":"M1","isin":"OLD"}}`,
			row:      store.RegistryRow{Name: "QPNb1", Mint: "M1", Terms: json.RawMessage(`{"isin":"NEW"}`)},
			wantMint: "M1", wantIsin: "NEW",
		},
		{
			desc:     "placeholder row keeps the base's non-empty mint",
			base:     `{"QPNb1":{"mint":"M1","isin":"OLD"}}`,
			row:      store.RegistryRow{Name: "QPNb1", Mint: "", Terms: json.RawMessage(`{"isin":"NEW"}`)},
			wantMint: "M1",
		},
		{
			desc:     "placeholder row keeps the CLI-written mint from the current config",
			base:     `{"QPNb1":{"mint":"","isin":"OLD"}}`,
			current:  `{"QPNb1":{"mint":"CLIM","cashMint":"tKZT"}}`,
			row:      store.RegistryRow{Name: "QPNb1", Mint: "", Terms: json.RawMessage(`{"isin":"NEW"}`)},
			wantMint: "CLIM", wantIsin: "NEW",
		},
		{
			desc:     "registry-only name behaves as today",
			base:     `{}`,
			current:  `{"CLI1":{"mint":"C1"}}`,
			row:      store.RegistryRow{Name: "SBX-A", Mint: "M9", Terms: json.RawMessage(`{"isin":"KZ"}`)},
			wantMint: "M9", wantIsin: "KZ",
		},
	}
	for _, tc := range cases {
		t.Run(tc.desc, func(t *testing.T) {
			dir := t.TempDir()
			base := filepath.Join(dir, "base.json")
			if err := os.WriteFile(base, []byte(`{"programId":"P","series":`+tc.base+`}`), 0o644); err != nil {
				t.Fatal(err)
			}
			out := filepath.Join(dir, "out.json")
			if tc.current != "" {
				if err := os.WriteFile(out, []byte(`{"programId":"P","series":`+tc.current+`}`), 0o644); err != nil {
					t.Fatal(err)
				}
			}
			if err := Write(base, out, []store.RegistryRow{tc.row}); err != nil {
				t.Fatal(err)
			}
			var got struct {
				Series map[string]map[string]any `json:"series"`
			}
			b, _ := os.ReadFile(out)
			if err := json.Unmarshal(b, &got); err != nil {
				t.Fatal(err)
			}
			entry := got.Series[tc.row.Name]
			if entry == nil {
				t.Fatalf("series %s missing from %s", tc.row.Name, out)
			}
			if entry["mint"] != tc.wantMint {
				t.Errorf("mint = %v, want %q", entry["mint"], tc.wantMint)
			}
			if tc.wantIsin != "" && entry["isin"] != tc.wantIsin {
				t.Errorf("isin = %v, want %q", entry["isin"], tc.wantIsin)
			}
		})
	}
}

// TestWriteKeepsCliOnlyEntries: entries in the current outPath that are neither in base nor in the
// registry (the CLI writes series directly) must survive a registrar rewrite.
func TestWriteKeepsCliOnlyEntries(t *testing.T) {
	dir := t.TempDir()
	base := filepath.Join(dir, "base.json")
	if err := os.WriteFile(base, []byte(`{"programId":"P","series":{}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(dir, "out.json")
	if err := os.WriteFile(out, []byte(`{"programId":"P","series":{"CLI1":{"mint":"C1","isin":"X"},"AlsoCLI":{"mint":"C2"},"RollbackLeft":{"mint":""}}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Write(base, out, []store.RegistryRow{{Name: "REG1", Mint: "M1"}}); err != nil {
		t.Fatal(err)
	}
	var got struct {
		Series map[string]map[string]any `json:"series"`
	}
	b, _ := os.ReadFile(out)
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatal(err)
	}
	for name, want := range map[string]string{"CLI1": "C1", "AlsoCLI": "C2", "REG1": "M1"} {
		if got.Series[name] == nil || got.Series[name]["mint"] != want {
			t.Errorf("series %s = %v, want mint %q", name, got.Series[name], want)
		}
	}
	if got.Series["RollbackLeft"] != nil {
		t.Error("empty-mint placeholder a rollback left behind was kept, want dropped")
	}
}

// TestWriteConcurrentPlaceholderKeepsCliMint: the prod race — series:create wrote the real mint into
// outPath, then concurrent config regenerations (issuer create, another sandbox, rollback) all carry
// the placeholder row. Under the shared lock with the current-config read, the CLI mint survives.
func TestWriteConcurrentPlaceholderKeepsCliMint(t *testing.T) {
	dir := t.TempDir()
	base := filepath.Join(dir, "base.json")
	if err := os.WriteFile(base, []byte(`{"programId":"P","series":{}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(dir, "out.json")
	if err := os.WriteFile(out, []byte(`{"programId":"P","series":{"SBX-A":{"mint":"CLIM","isin":"KZ"}}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	errCh := make(chan error, 8)
	for range 8 {
		go func() {
			errCh <- Write(base, out, []store.RegistryRow{{Name: "SBX-A", Mint: "", Terms: json.RawMessage(`{"isin":"KZ"}`)}})
		}()
	}
	for range 8 {
		if err := <-errCh; err != nil {
			t.Fatal(err)
		}
	}
	var got struct {
		Series map[string]map[string]any `json:"series"`
	}
	b, _ := os.ReadFile(out)
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatal(err)
	}
	if got.Series["SBX-A"]["mint"] != "CLIM" {
		t.Fatalf("mint after 8 concurrent placeholder rewrites = %v, want CLIM", got.Series["SBX-A"]["mint"])
	}
	if _, err := os.Stat(out + ".lock"); !os.IsNotExist(err) {
		t.Error("lock file left behind")
	}
}

// TestWriteBreaksStaleLock: a lock older than 60 s (crashed writer) must not block the rewrite —
// same recovery the CLI's updateConfig does.
func TestWriteBreaksStaleLock(t *testing.T) {
	dir := t.TempDir()
	base := filepath.Join(dir, "base.json")
	if err := os.WriteFile(base, []byte(`{"programId":"P","series":{}}`), 0o644); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(dir, "out.json")
	lock := out + ".lock"
	if err := os.WriteFile(lock, []byte("999\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-2 * time.Minute)
	if err := os.Chtimes(lock, old, old); err != nil {
		t.Fatal(err)
	}
	if err := Write(base, out, []store.RegistryRow{{Name: "A", Mint: "M"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(lock); !os.IsNotExist(err) {
		t.Error("stale lock not removed")
	}
}
