package api

// Approval gate endpoints (task 024): the scheduler with approval_required
// records what it wants to run; a human approves and this file executes the
// stored argv through the executor (same qupon CLI, same on-chain checks).

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

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
		if status != "pending" && status != "executed" && status != "all" {
			writeError(w, http.StatusBadRequest, "status must be pending, executed or all")
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
func approveApproval(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.AdvanceToken != "" &&
			subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+deps.AdvanceToken)) != 1 {
			writeError(w, http.StatusUnauthorized, "approve requires Authorization: Bearer <ADVANCE_TOKEN>")
			return
		}
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

		res, err := deps.Executor.Run(r.Context(), row.Args...)
		if err != nil {
			writeError(w, http.StatusGatewayTimeout, err.Error())
			return
		}
		if !res.OK {
			writeError(w, http.StatusConflict, res.Error) // stays pending; retryable
			return
		}
		detail, _ := json.Marshal(res)
		if err := st.FinishApproval(r.Context(), id, string(detail)); err != nil {
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
		_, _ = st.InsertActivity(r.Context(), store.Activity{
			Ts: time.Now().Unix(), SeriesMint: &mint, ActionPDA: strPtr(row.ActionPDA), Kind: "approval:" + step,
			Payload: payload, Sig: sig, Slot: uint64(res.Slot),
		}) // execution succeeded; only the audit trail is degraded
		resp := advanceResponse{Step: step, OK: true, Status: "executed",
			Signature: sigPtr(res), Slot: slotPtr(res), ExplorerURL: txExplorer(res.Signature)}
		writeJSON(w, http.StatusOK, resp)
	}
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
