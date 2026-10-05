// Package config loads registrar configuration from flags (defaults taken from env).
package config

import (
	"flag"
	"os"
	"time"
)

// Config is the registrar service configuration. All values come from
// flags whose defaults fall back to the documented environment variables.
type Config struct {
	RPCURL       string // RPC_URL — Solana devnet RPC endpoint
	ProgramID    string // PROGRAM_ID — qupon_bonds program id
	DBPath       string // DB_PATH — SQLite file path
	QuponCLI     string // QUPON_CLI — path to the qupon CLI executable
	QuponConfig  string // QUPON_CONFIG — qupon config (series names/mints)
	AdvanceToken string // ADVANCE_TOKEN — bearer token for POST /actions/{pda}/advance (empty = open, local only)
	Port         string // PORT — HTTP listen port

	// Scheduler / autopilot (task 024). Scheduler defaults off; -demo-speed
	// implies -scheduler with short cadence (2-minute announce lead).
	Scheduler        bool          // SCHEDULER — run the autopilot tick loop
	DemoSpeed        bool          // DEMO_SPEED — full coupon cycle in minutes
	AutoFund         bool          // AUTOFUND — fund escrows from the paying agent
	ApprovalRequired bool          // APPROVAL_REQUIRED — propose only, wait for POST /approvals/{id}/approve
	DryRun           bool          // SCHEDULER_DRY_RUN — log decisions, execute nothing
	Tick             time.Duration // SCHEDULER_TICK — 0 = preset (30 s, demo 5 s)
	Lead             time.Duration // SCHEDULER_LEAD — 0 = preset (5 d, demo 2 m)
	PaymentDelay     time.Duration // SCHEDULER_PAYMENT_DELAY — 0 = preset (2 d, demo 60 s)
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envBool(key string) bool { return os.Getenv(key) == "1" || os.Getenv(key) == "true" }

// FromFlags builds Config from command-line flags, defaulting to env vars,
// then to sane devnet defaults.
func FromFlags(args []string) Config {
	c := Config{
		RPCURL:           env("RPC_URL", "https://api.devnet.solana.com"),
		ProgramID:        env("PROGRAM_ID", ""),
		DBPath:           env("DB_PATH", "registrar.db"),
		QuponCLI:         env("QUPON_CLI", "qupon"),
		QuponConfig:      env("QUPON_CONFIG", "config/devnet.json"),
		AdvanceToken:     env("ADVANCE_TOKEN", ""),
		Port:             env("PORT", "8080"),
		Scheduler:        envBool("SCHEDULER"),
		DemoSpeed:        envBool("DEMO_SPEED"),
		AutoFund:         envBool("AUTOFUND"),
		ApprovalRequired: envBool("APPROVAL_REQUIRED"),
		DryRun:           envBool("SCHEDULER_DRY_RUN"),
	}
	fs := flag.NewFlagSet("registrar", flag.ContinueOnError)
	fs.StringVar(&c.RPCURL, "rpc", c.RPCURL, "Solana RPC URL (RPC_URL)")
	fs.StringVar(&c.ProgramID, "program", c.ProgramID, "qupon_bonds program id (PROGRAM_ID)")
	fs.StringVar(&c.DBPath, "db", c.DBPath, "SQLite database path (DB_PATH)")
	fs.StringVar(&c.QuponCLI, "cli", c.QuponCLI, "path to the qupon CLI (QUPON_CLI)")
	fs.StringVar(&c.QuponConfig, "qupon-config", c.QuponConfig, "path to qupon config/devnet.json (QUPON_CONFIG)")
	fs.StringVar(&c.Port, "port", c.Port, "HTTP listen port (PORT)")
	fs.BoolVar(&c.Scheduler, "scheduler", c.Scheduler, "run the autopilot scheduler (SCHEDULER)")
	fs.BoolVar(&c.DemoSpeed, "demo-speed", c.DemoSpeed, "demo cadence: implies -scheduler, 2-minute announce lead, autofund (DEMO_SPEED)")
	fs.BoolVar(&c.AutoFund, "autofund", c.AutoFund, "scheduler funds escrows from the paying agent (AUTOFUND)")
	fs.BoolVar(&c.ApprovalRequired, "approval-required", c.ApprovalRequired, "scheduler only proposes; a human approves via POST /approvals/{id}/approve (APPROVAL_REQUIRED)")
	fs.BoolVar(&c.DryRun, "scheduler-dry-run", c.DryRun, "log scheduler decisions without executing anything (SCHEDULER_DRY_RUN)")
	fs.DurationVar(&c.Tick, "tick", c.Tick, "scheduler tick period, 0 = preset (SCHEDULER_TICK)")
	fs.DurationVar(&c.Lead, "lead", c.Lead, "announce lead before next coupon, 0 = preset (SCHEDULER_LEAD)")
	fs.DurationVar(&c.PaymentDelay, "payment-delay", c.PaymentDelay, "record→payment delay for announced actions, 0 = preset (SCHEDULER_PAYMENT_DELAY)")
	// Parse errors are printed by the flag package; main treats them as fatal.
	_ = fs.Parse(args)
	return c
}
