// Command registrar is the Qupon off-chain service: HTTP API, SQLite mirror,
// scheduler, reconciler and ISO 20022 exports (see docs/02-architecture.md).
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/api"
	"github.com/qupon-kz/qupon/services/registrar/internal/config"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

var version = "0.1.0-dev"

func main() {
	if err := run(); err != nil {
		slog.Error("registrar exited", "err", err)
		os.Exit(1)
	}
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

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.New(logger, st),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe() }()
	logger.Info("registrar listening",
		"version", version, "port", cfg.Port, "db", cfg.DBPath, "rpc", cfg.RPCURL, "program", cfg.ProgramID, "cli", cfg.QuponCLI)

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
