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
	"strings"
	"syscall"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/api"
	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/config"
	"github.com/qupon-kz/qupon/services/registrar/internal/execconfig"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/ingest"
	"github.com/qupon-kz/qupon/services/registrar/internal/notice"
	"github.com/qupon-kz/qupon/services/registrar/internal/reconcile"
	"github.com/qupon-kz/qupon/services/registrar/internal/scheduler"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
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

	// One chain client feeds the poller, the startup series index, the
	// reconcile endpoint and the ISO 20022 exports (nil when unconfigured).
	var chainClient *chain.Client
	var chainReader reconcile.Reader
	if cfg.ProgramID != "" {
		program, err := solana.PublicKeyFromBase58(cfg.ProgramID)
		if err != nil {
			return fmt.Errorf("parse program id %q: %w", cfg.ProgramID, err)
		}
		chainClient = chain.NewClient(cfg.RPCURL, program, logger)
		chainReader = chainClient
		poller := ingest.NewPoller(cfg.RPCURL, program, st, logger)
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

	srv := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: api.New(logger, st, api.Deps{
			Read:         readModel(chainClient),
			Notice:       noticeReader(chainClient, st),
			Reconcile:    chainReader,
			Chain:        chainClient,
			Executor:     exec,
			BaseConfig:   cfg.QuponConfig,
			ReadCacheTTL: 10 * time.Second,
			SignInLimit:  auth.NewLimiter(20, time.Minute),
			Auth: &auth.Service{Store: st, Now: time.Now, TTL: 12 * time.Hour, DemoLogin: cfg.DemoLogin,
				Limit: auth.NewLimiter(5, time.Minute)},
		}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       120 * time.Second,
		// a write may wait for an executor slot, then run the CLI (≤ executor.Timeout)
		WriteTimeout: 3*executor.Timeout + 30*time.Second,
	}

	// Autopilot (task 024): --demo-speed implies the scheduler with a cadence
	// that runs a full coupon cycle unattended.
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
			go (&scheduler.Scheduler{Cfg: sc, Read: chainClient, Exec: exec, Store: st, Log: logger}).Run(ctx)
		}
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

// readModel avoids a typed-nil interface when no PROGRAM_ID is configured.
func readModel(c *chain.Client) api.ReadModel {
	if c == nil {
		return nil
	}
	return c
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
