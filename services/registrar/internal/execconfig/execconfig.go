// Package execconfig writes the CLI config the executor uses: the base
// config (config/devnet.json, baked into the image) merged with the series
// registry, so newly created series reach the CLI without a redeploy
// (Plan 2 Task 4; replaces the read-only bind mount and series-config.ts).
package execconfig

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// The lock mirrors the CLI's updateConfig (clients/ts/src/lib/config.ts):
// exclusive <path>.lock, ~75 ms retries, 30 s give-up, stale after 60 s.
// Go's atomic rename and the CLI's locked write must serialise, or a rewrite
// and an in-flight series:create lose each other's mint (task 91562).
const (
	lockRetry   = 75 * time.Millisecond
	lockTimeout = 30 * time.Second
	lockStale   = 60 * time.Second
)

// lockOut takes the same lock the CLI's updateConfig takes. It returns the
// release func; a lock older than lockStale (crashed writer) is broken.
func lockOut(outPath string) (release func(), err error) {
	lockPath := outPath + ".lock"
	deadline := time.Now().Add(lockTimeout)
	for {
		f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
		if err == nil {
			_, _ = fmt.Fprintf(f, "%d\n", os.Getpid())
			_ = f.Close()
			return func() { _ = os.Remove(lockPath) }, nil
		}
		if !errors.Is(err, os.ErrExist) {
			return nil, fmt.Errorf("lock %s: %w", lockPath, err)
		}
		if fi, statErr := os.Stat(lockPath); statErr == nil && time.Since(fi.ModTime()) > lockStale {
			_ = os.Remove(lockPath) // stale lock broken — race for it again
			continue
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("lock %s: busy for more than %s", lockPath, lockTimeout)
		}
		time.Sleep(lockRetry)
	}
}

// mintOf returns an entry's mint ("" when absent) — series entries are flat
// maps from JSON.
func mintOf(entry map[string]any) string {
	m, _ := entry["mint"].(string)
	return m
}

// Write merges rows into the base config's `series` map and rewrites outPath
// atomically (temp file + rename in the same directory) under the CLI's lock.
//
// Precedence per series name (task 91562 — a rewrite must never drop a live
// mint, and a stale registry row must not shadow the operator-curated base):
//   - a base entry with a non-empty mint wins over a registry row carrying a
//     different mint (warned once per name);
//   - a registry row with mint "" never overwrites a non-empty mint from the
//     base or from the current outPath (an in-flight series:create wrote it);
//   - entries in the current outPath that are in neither base nor registry
//     (the CLI writes series directly) are kept;
//   - otherwise a registry row overrides a same-named base entry as before,
//     and all other base fields pass through.
func Write(basePath, outPath string, rows []store.RegistryRow) error {
	release, err := lockOut(outPath)
	if err != nil {
		return err
	}
	defer release()

	raw, err := os.ReadFile(basePath)
	if err != nil {
		return fmt.Errorf("read base config: %w", err)
	}
	var cfg map[string]any
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return fmt.Errorf("parse %s: %w", basePath, err)
	}
	base, _ := cfg["series"].(map[string]any)
	if base == nil {
		base = map[string]any{}
	}
	// The CURRENT outPath, read inside the lock: entries the CLI wrote since
	// the last rewrite (series:create mints, CLI-created series) must survive.
	current := map[string]any{}
	if raw, err := os.ReadFile(outPath); err == nil {
		var c map[string]any
		if json.Unmarshal(raw, &c) == nil {
			if s, _ := c["series"].(map[string]any); s != nil {
				current = s
			}
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("read %s: %w", outPath, err)
	}

	log := slog.Default()
	merged := make(map[string]any, len(base)+len(current)+len(rows))
	for name, entry := range base {
		merged[name] = entry
	}
	inRows := make(map[string]bool, len(rows))
	for _, r := range rows {
		inRows[r.Name] = true
		entry := map[string]any{}
		if len(r.Terms) > 0 {
			if err := json.Unmarshal(r.Terms, &entry); err != nil {
				return fmt.Errorf("parse terms for %s: %w", r.Name, err)
			}
		}
		mint := r.Mint
		if baseEntry, ok := base[r.Name].(map[string]any); ok && mintOf(baseEntry) != "" && mintOf(baseEntry) != mint {
			// The base config is operator-curated; a stale registry row (a
			// superseded on-chain series under the same name) must not shadow
			// its mint — the scheduler resolves mints through this file.
			log.Warn("exec config: base mint wins over registry row", "series", r.Name,
				"baseMint", mintOf(baseEntry), "registryMint", mint)
			continue // merged already holds the base entry
		}
		if mint == "" {
			if cur, ok := current[r.Name].(map[string]any); ok {
				mint = mintOf(cur) // never drop a mint an in-flight series:create wrote
			}
		}
		entry["mint"] = mint
		merged[r.Name] = entry
	}
	for name, entry := range current {
		cur, ok := entry.(map[string]any)
		if _, inBase := base[name]; ok && !inBase && !inRows[name] && mintOf(cur) != "" {
			// A CLI-written series the registry does not know. An empty mint means a placeholder a
			// rolled-back create left in this file — drop it, like the pre-91562 rewrite did.
			merged[name] = cur
		}
	}

	cfg["series"] = merged
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
