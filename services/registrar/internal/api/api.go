// Package api serves the registrar REST surface (chi): JSON helpers, CORS,
// health check and the OpenAPI document. Endpoint handlers arrive with the
// reader/reconciler/executor tasks.
package api

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/notice"
	"github.com/qupon-kz/qupon/services/registrar/internal/reconcile"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

//go:embed openapi.yaml
var openapiFS embed.FS

// Deps are optional backends behind some endpoints; a nil field makes that endpoint answer 503.
// Add a field here (not a positional parameter) when a task needs a new backend.
type Deps struct {
	Notice    *notice.Reader
	Reconcile reconcile.Reader
	Chain     *chain.Client
	Read      ReadModel          // series/investors/schedule/actions/entitlements read models (rest.go)
	Executor  *executor.Executor // qupon CLI runner (advance.go); nil → /advance answers 503
	// AdvanceToken (ADVANCE_TOKEN), when set, is required as "Authorization: Bearer <token>" on /advance —
	// that endpoint signs transactions with the operator keys, so a public deployment must set it.
	AdvanceToken string
}

// New builds the HTTP handler tree.
func New(logger *slog.Logger, st *store.Store, deps Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.Recoverer)
	r.Use(loggerMiddleware(logger), corsReadOnly)

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := st.Ping(ctx); err != nil {
			writeError(w, http.StatusServiceUnavailable, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Get("/openapi.yaml", func(w http.ResponseWriter, r *http.Request) {
		body, err := openapiFS.ReadFile("openapi.yaml")
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/yaml")
		_, _ = w.Write(body)
	})

	r.Get("/actions/{pda}/notice", func(w http.ResponseWriter, r *http.Request) {
		lang := r.URL.Query().Get("lang")
		if lang == "" {
			lang = "en"
		}
		if lang != "en" && lang != "ru" {
			writeError(w, http.StatusBadRequest, "lang must be en or ru")
			return
		}
		pda, err := solana.PublicKeyFromBase58(chi.URLParam(r, "pda"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid action pda")
			return
		}
		if deps.Notice == nil {
			writeError(w, http.StatusServiceUnavailable, "chain reader not configured")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		text, err := deps.Notice.Notice(ctx, pda, lang)
		if err != nil {
			if errors.Is(err, notice.ErrActionNotFound) {
				writeError(w, http.StatusNotFound, err.Error())
				return
			}
			if errors.Is(err, notice.ErrNotYetSettled) {
				writeError(w, http.StatusConflict, err.Error())
				return
			}
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		_, _ = w.Write([]byte(text))
	})

	r.Get("/activity", func(w http.ResponseWriter, r *http.Request) {
		limit := 100
		if v := r.URL.Query().Get("limit"); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 1 || n > 500 {
				writeError(w, http.StatusBadRequest, "limit must be 1..500")
				return
			}
			limit = n
		}
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		events, err := st.ListActivity(ctx, limit)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"events": events})
	})

	mountReadModels(r, deps.Read, st)

	r.Get("/actions/{pda}/reconcile", func(w http.ResponseWriter, r *http.Request) {
		if deps.Reconcile == nil {
			writeError(w, http.StatusServiceUnavailable, "chain reader not configured (PROGRAM_ID)")
			return
		}
		pda, err := solana.PublicKeyFromBase58(chi.URLParam(r, "pda"))
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid action pda")
			return
		}
		// One action can hold many holders; devnet latency dominates.
		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()
		rep, err := reconcile.Run(ctx, deps.Reconcile, pda)
		if errors.Is(err, reconcile.ErrActionNotFound) {
			writeError(w, http.StatusNotFound, "action not found")
			return
		}
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		detail, err := json.Marshal(rep)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		status := "ok"
		if !rep.Ok {
			status = "mismatch"
		}
		if err := st.InsertRun(r.Context(), store.Run{
			Ts: time.Now().Unix(), ActionPDA: pda.String(),
			Step: "reconcile", Status: status, Detail: string(detail),
		}); err != nil {
			// The report is still served; only the audit trail is degraded.
			logger.Error("store reconcile run", "pda", pda.String(), "err", err)
		}
		writeJSON(w, http.StatusOK, rep)
	})

	r.Get("/actions/{pda}/iso/seev031.xml", isoSeev031(deps.Chain))
	r.Get("/actions/{pda}/iso/seev036.zip", isoSeev036Zip(deps.Chain))
	r.Get("/entitlements/{pda}/iso/seev036.xml", isoSeev036(deps.Chain))

	r.Post("/actions/{pda}/advance", advanceAction(deps, st, logger))

	// Scheduler surface (task 024): planned actions + approval gate.
	r.Get("/approvals", listApprovals(st))
	r.Post("/approvals/{id}/approve", approveApproval(deps, st))

	return r
}

// corsLocalhost allows the Next.js dev console (localhost:3000) to call the API.
// corsReadOnly lets any origin read (the investor portal fetches from the browser; the data is public devnet
// state). Writes get no CORS headers: the console reaches POST /advance through its own server route.
func corsReadOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", "*")
			h.Set("Access-Control-Allow-Methods", "GET, HEAD")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func loggerMiddleware(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			start := time.Now()
			next.ServeHTTP(ww, r)
			logger.Info("http",
				"method", r.Method,
				"path", r.URL.Path,
				"status", ww.Status(),
				"bytes", ww.BytesWritten(),
				"duration", time.Since(start).String(),
				"request_id", middleware.GetReqID(r.Context()),
			)
		})
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// ponytail: header already sent; nothing better to do than log-free no-op
		_ = err
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
