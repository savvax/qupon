package api

// Approval gate endpoints (task 024): the scheduler with approval_required
// records what it wants to run; a human approves and this file executes the
// stored argv through the executor (same qupon CLI, same on-chain checks).

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// listApprovals serves GET /approvals?status=pending|executed|"" (all);
// pending by default — that is the human's queue.
func listApprovals(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status := r.URL.Query().Get("status")
		if status == "" {
			status = "pending"
		}
		if status != "pending" && status != "running" && status != "executed" && status != "rejected" && status != "stale" && status != "all" {
			writeError(w, http.StatusBadRequest, "status must be pending, running, executed, rejected, stale or all")
			return
		}
		if status == "all" {
			status = ""
		}
		rows, err := st.ListApprovals(r.Context(), status)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if rows == nil {
			rows = []store.Approval{}
		}
		writeJSON(w, http.StatusOK, map[string]any{"approvals": rows})
	}
}

// approveApproval serves POST /approvals/{id}/approve: run the stored argv.
// A refused step keeps the row pending (the human can retry); only success
// marks it executed.
func approveApproval(deps Deps, st *store.Store, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Executor == nil {
			writeError(w, http.StatusServiceUnavailable, "executor not configured (set QUPON_CLI)")
			return
		}
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id < 1 {
			writeError(w, http.StatusBadRequest, "id must be a positive integer")
			return
		}
		row, err := st.ApprovalByID(r.Context(), id)
		if errors.Is(err, store.ErrNoApproval) {
			writeError(w, http.StatusNotFound, "no approval "+strconv.FormatInt(id, 10))
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if row.Status != "pending" {
			writeError(w, http.StatusConflict, "approval already "+row.Status)
			return
		}
		// Claim before executing: a second concurrent approve loses the atomic
		// pending→running UPDATE and gets a 409 instead of running the CLI twice.
		claimed, err := st.ClaimApproval(r.Context(), id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !claimed {
			writeError(w, http.StatusConflict, "approval already claimed")
			return
		}

		// Detach the run (and the approval-row bookkeeping tied to its outcome) from the
		// request context: a client disconnect must not kill the CLI mid-batch or strand
		// the row in "running". The executor's 120 s cap stays the only deadline.
		ctx := context.WithoutCancel(r.Context())
		res, err := deps.Executor.Run(ctx, row.Args...)
		if err != nil {
			if rerr := st.RevertApproval(ctx, id); rerr != nil {
				writeError(w, http.StatusInternalServerError, rerr.Error())
				return
			}
			writeError(w, http.StatusGatewayTimeout, err.Error())
			return
		}
		if !res.OK {
			// A failed pay/snapshot run may have moved money in earlier batches: keep their signatures.
			recordPartialBatches(ctx, st, slog.Default(), row.ActionPDA, "approval:"+row.Step, res)
			if rerr := st.RevertApproval(ctx, id); rerr != nil {
				writeError(w, http.StatusInternalServerError, rerr.Error())
				return
			}
			writeError(w, http.StatusConflict, res.Error) // stays pending; retryable
			return
		}

		detail, _ := json.Marshal(res)
		if err := st.FinishApproval(ctx, id, string(detail)); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		step := row.Step
		sig := res.Signature
		if sig == "" {
			sig = "approval-" + strconv.FormatInt(id, 10)
		}
		mint := row.SeriesMint
		payload, _ := json.Marshal(map[string]any{"step": row.Step, "ok": true, "approvalId": id})
		_, _ = st.InsertActivity(ctx, store.Activity{
			Ts: time.Now().Unix(), SeriesMint: &mint, ActionPDA: strPtr(row.ActionPDA), Kind: "approval:" + step,
			Payload: payload, Sig: sig, Slot: uint64(res.Slot),
		}) // execution succeeded; only the audit trail is degraded

		// Task 1422: complete/close clear series.open_action, so the escrow
		// follow-up must run here too — same best-effort sweep as the advance
		// path (a sweep failure only logs; the approval is already executed).
		if strings.HasSuffix(step, executor.StepComplete) || strings.HasSuffix(step, executor.StepClose) {
			sweepAfterApproval(ctx, deps, st, logger, row)
		}

		resp := advanceResponse{Step: step, OK: true, Status: "executed",
			Signature: sigPtr(res), Slot: slotPtr(res), ExplorerURL: txExplorer(res.Signature)}
		writeJSON(w, http.StatusOK, resp)
	}
}

// rejectApproval serves POST /registrar/approvals/{id}/reject (task 1405):
// a registrar vetoes a pending proposal; nothing executes and the row leaves
// the pending queue as status=rejected.
func rejectApproval(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id < 1 {
			writeError(w, http.StatusBadRequest, "id must be a positive integer")
			return
		}
		rejected, err := st.RejectApproval(r.Context(), id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !rejected {
			if _, err := st.ApprovalByID(r.Context(), id); errors.Is(err, store.ErrNoApproval) {
				writeError(w, http.StatusNotFound, "no approval "+strconv.FormatInt(id, 10))
				return
			}
			writeError(w, http.StatusConflict, "approval is not pending")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": id, "status": "rejected"})
	}
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// sweepAfterApproval rebuilds the sweep argv from the executed approval's own
// args (executor.FlagValue) and runs the shared escrow follow-up (sweepEscrow).
func sweepAfterApproval(ctx context.Context, deps Deps, st *store.Store, logger *slog.Logger, row store.Approval) {
	pda, err := solana.PublicKeyFromBase58(row.ActionPDA)
	if err != nil {
		logger.Error("approval sweep: bad action pda", "pda", row.ActionPDA, "err", err)
		return
	}
	name, okName := executor.FlagValue(row.Args, "--series")
	idx, okIdx := executor.FlagValue(row.Args, "--index")
	index, perr := strconv.ParseUint(idx, 10, 32)
	if !okName || !okIdx || perr != nil {
		logger.Error("approval sweep: cannot rebuild argv from the approved step", "args", row.Args, "err", perr)
		return
	}
	sweepEscrow(ctx, deps, st, logger, pda, uint32(index), name)
}
