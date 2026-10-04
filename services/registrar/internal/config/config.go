// Package config loads registrar configuration from flags (defaults taken from env).
package config

import (
	"flag"
	"os"
)

// Config is the registrar service configuration. All values come from
// flags whose defaults fall back to the documented environment variables.
type Config struct {
	RPCURL    string // RPC_URL — Solana devnet RPC endpoint
	ProgramID string // PROGRAM_ID — qupon_bonds program id
	DBPath    string // DB_PATH — SQLite file path
	QuponCLI  string // QUPON_CLI — path to the qupon CLI executable
	Port      string // PORT — HTTP listen port
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// FromFlags builds Config from command-line flags, defaulting to env vars,
// then to sane devnet defaults.
func FromFlags(args []string) Config {
	c := Config{
		RPCURL:    env("RPC_URL", "https://api.devnet.solana.com"),
		ProgramID: env("PROGRAM_ID", ""),
		DBPath:    env("DB_PATH", "registrar.db"),
		QuponCLI:  env("QUPON_CLI", "qupon"),
		Port:      env("PORT", "8080"),
	}
	fs := flag.NewFlagSet("registrar", flag.ContinueOnError)
	fs.StringVar(&c.RPCURL, "rpc", c.RPCURL, "Solana RPC URL (RPC_URL)")
	fs.StringVar(&c.ProgramID, "program", c.ProgramID, "qupon_bonds program id (PROGRAM_ID)")
	fs.StringVar(&c.DBPath, "db", c.DBPath, "SQLite database path (DB_PATH)")
	fs.StringVar(&c.QuponCLI, "cli", c.QuponCLI, "path to the qupon CLI (QUPON_CLI)")
	fs.StringVar(&c.Port, "port", c.Port, "HTTP listen port (PORT)")
	// Parse errors are printed by the flag package; main treats them as fatal.
	_ = fs.Parse(args)
	return c
}
