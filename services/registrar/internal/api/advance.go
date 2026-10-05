package api

// POST /actions/{pda}/advance — drive one lifecycle step through the qupon
// CLI executor, then re-read the chain (docs/02-architecture.md §REST). The
// service holds no business logic: NextStep only maps status → CLI command,
// and every precondition is enforced on-chain (a CLI failure surfaces as 409
// with the CLI message).

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// AdvanceRequest is openapi.yaml#/components/schemas/AdvanceRequest.
type AdvanceRequest struct {
	Confirm  bool `json:"confirm"`
	AutoFund bool `json:"autofund"`
}

// advanceResponse is openapi.yaml#/components/schemas/AdvanceResponse.
type advanceResponse struct {
	Step        string  `json:"step"`
	OK          bool    `json:"ok"`
	Signature   *string `json:"signature"`
	ExplorerURL *string `json:"explorerUrl"`
	Slot        *uint64 `json:"slot"`
	Status      string  `json:"status"`
	NextStep    *string `json:"nextStep"`
	Preview     bool    `json:"preview"`
}

func txExplorer(sig string) *string {
	if sig == "" {
		return nil
	}
	u := "https://explorer.solana.com/tx/" + sig + "?cluster=devnet"
	return &u
}

// advanceAction runs one step: read the action → map the step → exec the CLI
// (idempotent on-chain batches make retries safe) → record activity →
// re-read the chain for the new status.
func advanceAction(deps Deps, st *store.Store, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Read == nil {
			writeError(w, http.StatusServiceUnavailable, "chain reader not configured (set PROGRAM_ID)")
			return
		}
		if deps.AdvanceToken != "" &&
			subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+deps.AdvanceToken)) != 1 {
			writeError(w, http.StatusUnauthorized, "advance requires Authorization: Bearer <ADVANCE_TOKEN>")
			return
		}
		if deps.Executor == nil {
			writeError(w, http.StatusServiceUnavailable, "executor not configured (set QUPON_CLI)")
			return
		}
		pda, ok := pathKey(w, r, "pda")
		if !ok {
			return
		}
		var req AdvanceRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "body must be AdvanceRequest JSON: "+err.Error())
			return
		}
		if !req.Confirm {
			writeError(w, http.StatusBadRequest, "confirm must be true")
			return
		}

		action, err := deps.Read.FetchCorporateAction(r.Context(), pda)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		if action == nil {
			writeError(w, http.StatusNotFound, "no corporate action at "+pda.String())
			return
		}
		series, err := deps.Read.FetchSeries(r.Context(), action.Series)
		if err != nil || series == nil {
			writeError(w, http.StatusBadGateway, fmt.Sprintf("series %s of action %s: %v", action.Series, pda, err))
			return
		}
		name, err := deps.Executor.SeriesName(series.Mint.String())
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		investors, err := deps.Read.FetchInvestorsBySeries(r.Context(), action.Series)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}

		step, wait := executor.NextStep(action, len(investors), time.Now(), req.AutoFund)
		if step == "" {
			writeError(w, http.StatusBadRequest, wait)
			return
		}

		// Dry-run preview: confirm=false would reach here only via the
		// preview endpoint; kept simple — confirm is mandatory above.
		args, err := executor.Args(step, name, action.Index)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		// One step may send several transactions (batch commands); the CLI
		// cap (120 s) dominates the request budget.
		res, err := deps.Executor.Run(r.Context(), args...)
		if err != nil {
			writeError(w, http.StatusGatewayTimeout, err.Error())
			return
		}
		if !res.OK {
			// The chain refused the step (WrongStatus, TooEarly, …): the
			// client retries; the message is the CLI's own.
			writeError(w, http.StatusConflict, res.Error)
			return
		}

		recordAdvance(r, st, logger, pda, action.Index, step, res)

		// Verify against the chain, not the CLI output.
		fresh, err := deps.Read.FetchCorporateAction(r.Context(), pda)
		if err != nil || fresh == nil {
			fresh = action // read failed: serve the pre-step view, log nothing extra
		}
		resp := advanceResponse{
			Step: step, OK: true, Status: chain.ActionStatusName(fresh.Status),
			Signature: sigPtr(res), Slot: slotPtr(res), ExplorerURL: txExplorer(res.Signature),
		}
		if next, wait := executor.NextStep(fresh, len(investors), time.Now(), req.AutoFund); next != "" {
			resp.NextStep = &next
		} else if wait != "" {
			resp.NextStep = nil
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

func sigPtr(res executor.Result) *string {
	if res.Signature == "" {
		return nil
	}
	return &res.Signature
}

func slotPtr(res executor.Result) *uint64 {
	if res.Slot == 0 {
		return nil
	}
	s := uint64(res.Slot)
	return &s
}

func recordAdvance(r *http.Request, st *store.Store, logger *slog.Logger, pda solana.PublicKey, index uint32, step string, res executor.Result) {
	sig := res.Signature
	if sig == "" {
		sig = fmt.Sprintf("advance-%s-%d-%d", step, index, time.Now().UnixNano())
	}
	payload, _ := json.Marshal(map[string]any{
		"step": step, "ok": res.OK, "action": pda.String(), "index": index, "skipped": res.Skipped,
	})
	apda := pda.String()
	if _, err := st.InsertActivity(r.Context(), store.Activity{
		Ts: time.Now().Unix(), ActionPDA: &apda, Kind: "advance:" + step,
		Payload: payload, Sig: sig, Slot: uint64(res.Slot),
	}); err != nil {
		// The advance succeeded; only the audit trail is degraded.
		logger.Error("record advance activity", "pda", pda.String(), "step", step, "err", err)
	}
}
