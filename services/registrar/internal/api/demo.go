package api

// Demo investor endpoints (product spec §4): the labelled demo custodial
// wallet for judges without Phantom. Both routes sign with the server-side
// QUPON_INVESTOR_KEYPAIR through the qupon CLI executor — the service holds
// no signing logic, and every response is marked demo:true.

import (
	"encoding/json"
	"net/http"
	"strconv"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// demoSubscribeRequest is openapi.yaml#/components/schemas/DemoSubscribeRequest.
type demoSubscribeRequest struct {
	Series string `json:"series"` // bond mint (base58)
	Units  int64  `json:"units"`
}

// demoVoteRequest is openapi.yaml#/components/schemas/DemoVoteRequest.
type demoVoteRequest struct {
	Action string `json:"action"` // CorporateAction PDA (base58)
	Choice string `json:"choice"` // for | against | abstain
}

// POST /demo/investor/subscribe — placement at par through the executor.
func demoSubscribe(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Executor == nil {
			writeError(w, http.StatusServiceUnavailable, "executor not configured (set QUPON_CLI)")
			return
		}
		var req demoSubscribeRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "body must be DemoSubscribeRequest JSON: "+err.Error())
			return
		}
		if req.Units < 1 {
			writeError(w, http.StatusBadRequest, "units must be at least 1")
			return
		}
		mint, err := solana.PublicKeyFromBase58(req.Series)
		if err != nil {
			writeError(w, http.StatusBadRequest, "series must be a base58 mint")
			return
		}
		name, err := deps.Executor.SeriesName(mint.String())
		if err != nil {
			writeErrorCode(w, http.StatusNotFound, "unknown_series", "mint "+mint.String()+" is not a registered series")
			return
		}
		runDemo(w, r, deps, st, map[string]any{"series": name, "units": req.Units},
			"subscribe", "--series", name, "--units", strconv.FormatInt(req.Units, 10))
	}
}

// POST /demo/investor/vote — cast a snapshot-weighted vote on a meeting.
func demoVote(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Executor == nil {
			writeError(w, http.StatusServiceUnavailable, "executor not configured (set QUPON_CLI)")
			return
		}
		if deps.Read == nil {
			writeError(w, http.StatusServiceUnavailable, "chain reader not configured (set PROGRAM_ID)")
			return
		}
		var req demoVoteRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "body must be DemoVoteRequest JSON: "+err.Error())
			return
		}
		switch req.Choice {
		case "for", "against", "abstain":
		default:
			writeError(w, http.StatusBadRequest, `choice must be "for", "against" or "abstain"`)
			return
		}
		pda, err := solana.PublicKeyFromBase58(req.Action)
		if err != nil {
			writeError(w, http.StatusBadRequest, "action must be a base58 pubkey")
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
			writeError(w, http.StatusBadGateway, "series of action "+pda.String()+" unreadable")
			return
		}
		name, err := deps.Executor.SeriesName(series.Mint.String())
		if err != nil {
			writeErrorCode(w, http.StatusNotFound, "unknown_series", "mint "+series.Mint.String()+" is not a registered series")
			return
		}
		runDemo(w, r, deps, st, map[string]any{"action": pda.String(), "choice": req.Choice},
			"vote", "--series", name, "--index", strconv.FormatUint(uint64(action.Index), 10), "--choice", req.Choice)
	}
}

// runDemo executes one CLI command for the demo investor, audits it and
// writes the demo-marked response. CLI failures surface as 409 with the
// program's error name in onchainError (global error contract).
func runDemo(w http.ResponseWriter, r *http.Request, deps Deps, st *store.Store, params map[string]any, args ...string) {
	res, err := deps.Executor.Run(r.Context(), args...)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if !res.OK {
		audit(st, r, params, false, res.Error, nil)
		writeJSON(w, http.StatusConflict, map[string]any{
			"code": "onchain", "message": res.Error, "error": res.Error, "onchainError": res.Error,
		})
		return
	}
	sigs := []string{}
	if res.Signature != "" {
		sigs = []string{res.Signature}
	}
	audit(st, r, params, true, args[0], sigs)
	writeJSON(w, http.StatusOK, map[string]any{
		"demo": true, "ok": true, "signature": res.Signature, "explorerUrl": txExplorer(res.Signature),
	})
}
