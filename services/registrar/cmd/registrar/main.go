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
	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/config"
	"github.com/qupon-kz/qupon/services/registrar/internal/ingest"
	"github.com/qupon-kz/qupon/services/registrar/internal/notice"
	"github.com/qupon-kz/qupon/services/registrar/internal/reconcile"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

var version = "0.1.0-dev"

func main() {
	if err := run(); err != nil {
		slog.Error("registrar exited", "err", err)
		os.Exit(1)
	}
}

// indexSeries scans the program for Series accounts and mirrors them into
// the store so GET /series can serve them without hitting the chain.
func indexSeries(ctx context.Context, cl *chain.Client, logger *slog.Logger, st *store.Store) error {
	recs, err := cl.AllSeries(ctx)
	if err != nil {
		return err
	}
	for _, rec := range recs {
		data, err := json.Marshal(rec.Series.View(rec.PDA))
		if err != nil {
			return fmt.Errorf("marshal series %s: %w", rec.PDA, err)
		}
		if err := st.UpsertSeries(ctx, rec.Series.Mint.String(), data); err != nil {
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

	// Index all Series accounts at startup so GET /series serves the chain;
	// failures degrade to the stored mirror (task 051 wires live fixtures).
	if chainClient != nil {
		if err := indexSeries(ctx, chainClient, logger, st); err != nil {
			logger.Warn("series index skipped", "err", err)
		}
	}

	srv := &http.Server{
		Addr: ":" + cfg.Port,
		Handler: api.New(logger, st, api.Deps{
			Read:      readModel(chainClient),
			Notice:    noticeReader(chainClient),
			Reconcile: chainReader,
			Chain:     chainClient,
		}),
		ReadHeaderTimeout: 5 * time.Second,
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

// noticeReader is nil (endpoint answers 503) when no PROGRAM_ID is configured.
func noticeReader(c *chain.Client) *notice.Reader {
	if c == nil {
		return nil
	}
	return notice.NewReader(c, "")
}
