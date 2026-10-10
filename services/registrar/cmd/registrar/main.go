// Command registrar is the Qupon off-chain service: HTTP API, SQLite mirror,
// scheduler, reconciler and ISO 20022 exports (see docs/02-architecture.md).
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/api"
	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/config"
	"github.com/qupon-kz/qupon/services/registrar/internal/disclosure"
	"github.com/qupon-kz/qupon/services/registrar/internal/execconfig"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/ingest"
	"github.com/qupon-kz/qupon/services/registrar/internal/kase"
	"github.com/qupon-kz/qupon/services/registrar/internal/network"
	"github.com/qupon-kz/qupon/services/registrar/internal/notice"
	"github.com/qupon-kz/qupon/services/registrar/internal/reconcile"
	"github.com/qupon-kz/qupon/services/registrar/internal/sandbox"
	"github.com/qupon-kz/qupon/services/registrar/internal/scheduler"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
	"github.com/qupon-kz/qupon/services/registrar/internal/termsheet"
)

var version = "0.1.0-dev"

func main() {
	if err := run(); err != nil {
		slog.Error("registrar exited", "err", err)
		os.Exit(1)
	}
}

// indexSeries scans the program for Series accounts, mirrors them into the
// store so GET /series can serve them without hitting the chain, and seeds
// the series registry (Plan 2 Task 4) the executor config is generated from.
func indexSeries(ctx context.Context, cl *chain.Client, logger *slog.Logger, st *store.Store) error {
	recs, err := cl.AllSeries(ctx)
	if err != nil {
		return err
	}
	for _, rec := range recs {
		view := rec.Series.View(rec.PDA)
		data, err := json.Marshal(view)
		if err != nil {
			return fmt.Errorf("marshal series %s: %w", rec.PDA, err)
		}
		if err := st.UpsertSeries(ctx, view.Mint, data); err != nil {
			return err
		}
		if view.Ticker == "" {
			continue
		}
		terms, err := json.Marshal(map[string]any{
			"cashMint":      view.CashMint,
			"isin":          view.ISIN,
			"faceValue":     view.FaceValue,
			"couponRateBps": view.CouponRateBps,
			"frequency":     view.Frequency,
			"dayCount":      view.DayCount,
		})
		if err != nil {
			return fmt.Errorf("marshal terms %s: %w", rec.PDA, err)
		}
		if err := st.UpsertRegistry(ctx, store.RegistryRow{Name: view.Ticker, Mint: view.Mint, Terms: terms}); err != nil {
			return err
		}
	}
	logger.Info("indexed series", "count", len(recs))
	return nil
}

func run() error {
	cfg := config.FromFlags(os.Args[1:])
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	st, err := store.Open(ctx, cfg.DBPath)
	if err != nil {
		return err
	}
	defer func() { _ = st.Close() }()

	// Startup sweep (task 1411): a crash mid-approve leaves rows in running;
	// put them back in the human's queue so nothing stays stuck.
	if n, err := st.ResetRunningApprovals(ctx); err != nil {
		logger.Warn("approval sweep failed", "err", err)
	} else if n > 0 {
		logger.Info("reset running approvals to pending", "count", n)
	}

	// One chain client feeds the poller, the startup series index, the
	// reconcile endpoint and the ISO 20022 exports (nil when unconfigured).
	var chainClient *chain.Client
	var chainReader reconcile.Reader
	var poller *ingest.Poller // exposed to /admin/system (task 702): ingest lag
	if cfg.ProgramID != "" {
		program, err := solana.PublicKeyFromBase58(cfg.ProgramID)
		if err != nil {
			return fmt.Errorf("parse program id %q: %w", cfg.ProgramID, err)
		}
		chainClient = chain.NewClient(cfg.RPCURL, program, logger)
		chainReader = chainClient
		poller = ingest.NewPoller(cfg.RPCURL, program, st, logger)
		go poller.Run(ctx)
	} else {
		logger.Warn("PROGRAM_ID empty: activity poller disabled")
	}

	// Index all Series accounts at startup so GET /series serves the chain
	// and the registry is seeded; failures degrade to the stored mirror.
	if chainClient != nil {
		if err := indexSeries(ctx, chainClient, logger, st); err != nil {
			logger.Warn("series index skipped", "err", err)
		}
	}

	// Writable executor config (Plan 2 Task 4): base config + the series
	// registry, regenerated at startup — new series reach the CLI without a
	// redeploy or bind mount. Fatal on failure: the executor is unusable
	// without it.
	rows, err := st.ListRegistry(ctx)
	if err != nil {
		return fmt.Errorf("list series registry: %w", err)
	}
	if err := execconfig.Write(cfg.QuponConfig, cfg.ExecConfigPath, rows); err != nil {
		return fmt.Errorf("write executor config: %w", err)
	}
	exec := executor.New(cfg.QuponCLI, cfg.ExecConfigPath, logger)

	if err := seedUsers(ctx, st, cfg); err != nil {
		return fmt.Errorf("seed users: %w", err)
	}
	profile, err := network.FromConfig(cfg.QuponConfig)
	if err != nil {
		return err
	}
	network.SetExplorer(profile)
	if err := seedPlatform(ctx, st, cfg, profile); err != nil {
		return fmt.Errorf("seed platform: %w", err)
	}

	// Autopilot (task 024): --demo-speed implies the scheduler with a cadence
	// that runs a full coupon cycle unattended. Built before the server so
	// /admin/system (task 702) can report its state.
	var sched *scheduler.Scheduler
	if cfg.Scheduler || cfg.DemoSpeed {
		if chainClient == nil {
			logger.Warn("scheduler enabled but PROGRAM_ID is empty: not started")
		} else {
			sc := scheduler.DefaultConfig()
			if cfg.DemoSpeed {
				sc = scheduler.DemoConfig()
			}
			if cfg.Tick != 0 {
				sc.Tick = cfg.Tick
			}
			if cfg.Lead != 0 {
				sc.Lead = cfg.Lead
			}
			if cfg.PaymentDelay != 0 {
				sc.PaymentDelay = cfg.PaymentDelay
			}
			sc.AutoFund = cfg.AutoFund || sc.AutoFund
			sc.ApprovalRequired = cfg.ApprovalRequired
			sc.DryRun = cfg.DryRun
			sched = &scheduler.Scheduler{Cfg: sc, Read: chainClient, Exec: exec, Store: st, Log: logger,
				// Plan 15 D9: anchor each announced action's seev.031 right after the announce.
				Attach: schedulerAttach(disclosure.Deps{Chain: chainClient, Exec: exec, Log: logger})}
			go sched.Run(ctx)
		}
	}

	deps := api.Deps{
		Read:         readModel(chainClient),
		Notice:       noticeReader(chainClient, st),
		Reconcile:    chainReader,
		Chain:        chainClient,
		Executor:     exec,
		BaseConfig:   cfg.QuponConfig,
		Network:      profile,
		DataDir:      cfg.DataDir,
		ReadCacheTTL: 10 * time.Second,
		SignInLimit:  auth.NewLimiter(20, time.Minute),
		// demo accounts are public: bound what they can spend of the operator keys
		DemoLimit:       auth.NewLimiter(60, time.Hour),
		DemoSeriesLimit: auth.NewLimiter(10, 24*time.Hour),
		Auth: &auth.Service{Store: st, Now: time.Now, TTL: 12 * time.Hour, DemoLogin: cfg.DemoLogin,
			Limit: auth.NewLimiter(5, time.Minute)},
		// kase.kz market data (task 1001): public, cached, stale-if-error
		Kase: kase.NewService(st),
		// term-sheet import (task 042, EXPERIMENTAL): LLM when TERMSHEET_LLM_KEY/ZAI_API_KEY is set, else SIMULATED regex
		Termsheet: termsheet.FromEnv(),
	}
	// /admin/system probes (task 702): nil-checked so an unconfigured backend reports not running.
	if chainClient != nil {
		deps.SystemChain = chainClient
	}
	if sched != nil {
		deps.SystemScheduler = sched
	}
	if poller != nil {
		deps.SystemIngest = poller
	}

	// Judge sandbox (task 1524): devnet-only, needs the executor and the chain reader; limits from env.
	if exec != nil && chainClient != nil && !profile.Mainnet {
		deps.Sandbox = &sandbox.Service{
			Exec: exec, Store: st, Read: chainClient, BaseConfig: cfg.QuponConfig, Log: logger,
			Limits: sandbox.Limits{
				PerIPPerHour: envInt("QUPON_SANDBOX_PER_IP_HOUR", 3),
				PerDay:       envInt("QUPON_SANDBOX_PER_DAY", 30),
			},
			Outsider: os.Getenv("QUPON_SANDBOX_OUTSIDER"),
		}
		if !cfg.Scheduler && !cfg.DemoSpeed {
			logger.Warn("sandbox API enabled but the scheduler is off: a sandbox never advances past its first step (run with --scheduler or --demo-speed)")
		}
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.New(logger, st, deps),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       120 * time.Second,
		// a write may wait for an executor slot, then run the CLI (≤ executor.Timeout)
		WriteTimeout: 3*executor.Timeout + 30*time.Second,
	}

	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe() }()
	logger.Info("registrar listening",
		"version", version, "port", cfg.Port, "db", cfg.DBPath, "rpc", redactURL(cfg.RPCURL), "program", cfg.ProgramID, "cli", cfg.QuponCLI)

	select {
	case <-ctx.Done():
		logger.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

// envInt reads a non-negative int env var with a default (sandbox limits, task 1524).
func envInt(name string, def int) int {
	if v := os.Getenv(name); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return def
}

// readModel avoids a typed-nil interface when no PROGRAM_ID is configured.
func readModel(c *chain.Client) api.ReadModel {
	if c == nil {
		return nil
	}
	return c
}

// schedulerAttach adapts disclosure.Deps.Attach (best-effort, returns error)
// to the scheduler's fire-and-forget hook: failures are logged, the tick loop
// never stops because an anchor failed.
func schedulerAttach(d disclosure.Deps) func(context.Context, solana.PublicKey) {
	return func(ctx context.Context, pda solana.PublicKey) {
		if err := d.Attach(ctx, pda); err != nil {
			slog.Default().Warn("scheduler: disclosure attach", "action", pda.String(), "err", err)
		}
	}
}

// redactURL drops the query string (Helius puts the API key there) before the URL reaches the logs.
func redactURL(u string) string {
	if i := strings.IndexByte(u, '?'); i >= 0 {
		return u[:i] + "?…"
	}
	return u
}

// noticeReader is nil (endpoint answers 503) when no PROGRAM_ID is configured;
// the store supplies the action's settlement signatures for notice tx links.
func noticeReader(c *chain.Client, st *store.Store) *notice.Reader {
	if c == nil {
		return nil
	}
	r := notice.NewReader(c, "")
	r.Activity = st
	r.Symbol = st.CashAssetSymbol
	return r
}

// seedUsers upserts the demo identities (DEMO_LOGIN) and the QUPON_USERS accounts. Demo users get the
// password hash "!", which no password matches: they can only sign in through POST /auth/demo.
func seedUsers(ctx context.Context, st *store.Store, cfg config.Config) error {
	if cfg.DemoLogin {
		for _, u := range []store.User{
			{Email: "demo-issuer@qupon.demo", Name: "Demo issuer", Role: "issuer", IsDemo: true},
			{Email: "demo-registrar@qupon.demo", Name: "Demo registrar", Role: "registrar", IsDemo: true},
			{Email: "demo-investor@qupon.demo", Name: "Demo investor", Role: "investor_demo", IsDemo: true},
		} {
			if _, err := st.UpsertUser(ctx, u, "!"); err != nil {
				return err
			}
		}
	}
	if cfg.Users == "" {
		return nil
	}
	var users []struct{ Email, Name, Role, Password string }
	if err := json.Unmarshal([]byte(cfg.Users), &users); err != nil {
		return fmt.Errorf("QUPON_USERS is not a JSON array of users: %w", err)
	}
	for _, u := range users {
		email := strings.ToLower(strings.TrimSpace(u.Email))
		if !strings.Contains(email, "@") || len(u.Password) < 12 ||
			(u.Role != "issuer" && u.Role != "registrar" && u.Role != "admin") {
			return fmt.Errorf("QUPON_USERS entry %q: need an email, a password of 12+ characters and role issuer, registrar or admin", email)
		}
		hash, err := auth.HashPassword(u.Password)
		if err != nil {
			return fmt.Errorf("hash password for %s: %w", email, err)
		}
		if _, err := st.UpsertUser(ctx, store.User{Email: email, Name: u.Name, Role: u.Role}, hash); err != nil {
			return err
		}
	}
	return nil
}

// seedPlatform prepares platform v2 rows (spec 2026-10-06 §4) without overwriting admin edits: demo organisations
// with the demo users in them, the network's cash-asset presets from the base config ("cashAssets"), and the
// HIDE_SERIES list as hidden series settings.
func seedPlatform(ctx context.Context, st *store.Store, cfg config.Config, profile network.Profile) error {
	if cfg.DemoLogin {
		for _, d := range []struct{ org, kind, role string }{
			{"Demo Issuer JSC", "issuer", "issuer"},
			{"Demo Registrar", "registrar", "registrar"},
		} {
			o, err := st.OrganizationByName(ctx, d.org)
			if errors.Is(err, store.ErrNotFound) {
				o, err = st.CreateOrganization(ctx, store.Organization{Name: d.org, Kind: d.kind})
			}
			if err != nil {
				return err
			}
			u, err := st.DemoUser(ctx, d.role)
			if err != nil {
				return err
			}
			if err := st.SetUserOrg(ctx, u.ID, &o.ID); err != nil {
				return err
			}
		}
	}
	raw, err := os.ReadFile(cfg.QuponConfig)
	if err != nil {
		return fmt.Errorf("read %s: %w", cfg.QuponConfig, err)
	}
	var base struct {
		CashAssets []store.CashAsset `json:"cashAssets"`
	}
	if err := json.Unmarshal(raw, &base); err != nil {
		return fmt.Errorf("parse cashAssets in %s: %w", cfg.QuponConfig, err)
	}
	for _, a := range base.CashAssets {
		if a.Mint == "" { // e.g. mainnet KZTE until its address is confirmed from an official source
			continue
		}
		a.Network = profile.Name
		if err := st.InsertCashAssetIfMissing(ctx, a); err != nil {
			return err
		}
	}
	for _, m := range strings.FieldsFunc(cfg.HideSeries, func(r rune) bool { return r == ',' || r == ' ' || r == '\n' }) {
		if err := st.HideSeriesIfUnset(ctx, m); err != nil {
			return err
		}
	}
	return nil
}
