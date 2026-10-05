// Package execconfig writes the CLI config the executor uses: the base
// config (config/devnet.json, baked into the image) merged with the series
// registry, so newly created series reach the CLI without a redeploy
// (Plan 2 Task 4; replaces the read-only bind mount and series-config.ts).
package execconfig

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// Write merges rows into the base config's `series` map and writes outPath
// atomically (temp file + rename in the same directory). A registry row
// overrides a same-named base entry; all other base fields pass through.
func Write(basePath, outPath string, rows []store.RegistryRow) error {
	raw, err := os.ReadFile(basePath)
	if err != nil {
		return fmt.Errorf("read base config: %w", err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return fmt.Errorf("parse %s: %w", basePath, err)
	}
	series, _ := cfg["series"].(map[string]any)
	if series == nil {
		series = map[string]any{}
	}
	for _, r := range rows {
		entry := map[string]any{}
		if len(r.Terms) > 0 {
			if err := json.Unmarshal(r.Terms, &entry); err != nil {
				return fmt.Errorf("parse terms for %s: %w", r.Name, err)
			}
		}
		entry["mint"] = r.Mint
		series[r.Name] = entry
	}
	cfg["series"] = series
	out, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	tmp, err := os.CreateTemp(filepath.Dir(outPath), ".qupon-config-*.json")
	if err != nil {
		return fmt.Errorf("create temp config in %s: %w", filepath.Dir(outPath), err)
	}
	defer func() { _ = os.Remove(tmp.Name()) }() // no-op after a successful rename
	if _, err := tmp.Write(append(out, '\n')); err != nil {
		_ = tmp.Close()
		return fmt.Errorf("write %s: %w", tmp.Name(), err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close %s: %w", tmp.Name(), err)
	}
	if err := os.Rename(tmp.Name(), outPath); err != nil {
		return fmt.Errorf("rename %s → %s: %w", tmp.Name(), outPath, err)
	}
	return nil
}
