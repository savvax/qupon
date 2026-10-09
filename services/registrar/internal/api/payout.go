package api

// Bank-routed payouts (plan 15 D6): the holder chose the bank route, the escrow paid the paying agent
// (Entitlement status PaidToAgent) and the bank transfer is SIMULATED off-chain. The paying agent confirms
// each transfer from the console with its reference — the reference and the bank details never travel in
// clear: the CLI hashes them and only sha256 lands on-chain.

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// BankPendingPayout is one payout awaiting the paying agent's confirmation.
type BankPendingPayout struct {
	Owner            string `json:"owner"`
	EntitlementPda   string `json:"entitlementPda"`
	Amount           Amount `json:"amount"`           // net + principal (what left the escrow)
	RouteBankRefHash string `json:"routeBankRefHash"` // sha256 hex of the holder's bank details; empty when no route account was found
}

// bankPendingPayouts lists the action's PaidToAgent entitlements with each holder's route reference hash.
func bankPendingPayouts(ctx context.Context, rm ReadModel, pda solana.PublicKey, a *chain.CorporateAction, m money) ([]BankPendingPayout, error) {
	recs, err := rm.FetchEntitlementsByAction(ctx, pda)
	if err != nil {
		return nil, fmt.Errorf("entitlements of %s: %w", pda, err)
	}
	routes, err := rm.FetchPayoutRoutesBySeries(ctx, a.Series)
	if err != nil {
		return nil, fmt.Errorf("payout routes of %s: %w", a.Series, err)
	}
	hashByInvestor := make(map[solana.PublicKey]string, len(routes))
	for _, rr := range routes {
		if rr.Route != nil && rr.Route.Route == 1 {
			hashByInvestor[rr.Route.Investor] = hex.EncodeToString(rr.Route.BankRefHash[:])
		}
	}
	// Routes are keyed by the Investor PDA, entitlements by owner wallet: one investor scan joins them.
	investors, err := rm.FetchInvestorsBySeries(ctx, a.Series)
	if err != nil {
		return nil, fmt.Errorf("investors of %s: %w", a.Series, err)
	}
	hashByOwner := make(map[solana.PublicKey]string, len(investors))
	for _, ir := range investors {
		if h, ok := hashByInvestor[ir.PDA]; ok {
			hashByOwner[ir.Investor.Owner] = h
		}
	}
	items := make([]BankPendingPayout, 0, len(recs))
	for _, rec := range recs {
		e := rec.Entitlement
		if e.Status != 3 { // PaidToAgent only
			continue
		}
		items = append(items, BankPendingPayout{
			Owner: e.Owner.String(), EntitlementPda: rec.PDA.String(), Amount: m.amount(e.Net + e.Principal),
			RouteBankRefHash: hashByOwner[e.Owner],
		})
	}
	return items, nil
}

// ConfirmBankRequest is openapi.yaml#/components/schemas/ConfirmBankRequest.
type ConfirmBankRequest struct {
	Owner     string `json:"owner"`     // the holder whose payout was transferred (base58)
	Reference string `json:"reference"` // bank transfer reference; only its sha256 goes on-chain
}

// confirmBankPayout: POST /actions/{pda}/confirm-bank — runs `payout:confirm-bank` through the executor
// (120 s cap) and records an activity row, exactly like an advance step.
func confirmBankPayout(deps Deps, st *store.Store, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !needExecutor(w, deps) {
			return
		}
		if deps.Read == nil {
			writeError(w, http.StatusServiceUnavailable, "chain reader not configured (set PROGRAM_ID)")
			return
		}
		pda, ok := pathKey(w, r, "pda")
		if !ok {
			return
		}
		var req ConfirmBankRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		owner, err := solana.PublicKeyFromBase58(req.Owner)
		if err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "owner must be a base58 pubkey")
			return
		}
		if strings.TrimSpace(req.Reference) == "" {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "reference must not be empty")
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
		pending, err := bankPendingPayouts(r.Context(), deps.Read, pda, action, money{})
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		isPending := false
		for _, p := range pending {
			if p.Owner == owner.String() {
				isPending = true
				break
			}
		}
		if !isPending {
			writeError(w, http.StatusConflict, owner.String()+" has no bank payout awaiting confirmation on this action")
			return
		}

		series, err := deps.Read.FetchSeries(r.Context(), action.Series)
		if err != nil || series == nil {
			writeError(w, http.StatusBadGateway, fmt.Sprintf("series %s of action %s: %v", action.Series, pda, err))
			return
		}
		name, ok := seriesName(w, deps, series.Mint.String())
		if !ok {
			return
		}
		args, err := executor.Args(executor.StepConfirmBank, name, action.Index)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		args = append(args, "--owner", owner.String(), "--reference", req.Reference)

		res, err := deps.Executor.Run(context.WithoutCancel(r.Context()), args...)
		if err != nil {
			writeError(w, http.StatusGatewayTimeout, err.Error())
			return
		}
		if !res.OK {
			writeError(w, http.StatusConflict, res.Error)
			return
		}

		// Activity row like an advance step; the raw reference stays out of the audit trail (only its
		// sha256 is public, on-chain).
		sig := res.Signature
		if sig == "" {
			sig = fmt.Sprintf("advance-%s-%d-%d", executor.StepConfirmBank, action.Index, time.Now().UnixNano())
		}
		payload, _ := json.Marshal(map[string]any{
			"step": executor.StepConfirmBank, "ok": res.OK, "action": pda.String(), "index": action.Index, "owner": owner.String(),
		})
		apda := pda.String()
		if _, err := st.InsertActivity(context.WithoutCancel(r.Context()), store.Activity{
			Ts: time.Now().Unix(), ActionPDA: &apda, Kind: "advance:" + executor.StepConfirmBank,
			Payload: payload, Sig: sig, Slot: uint64(res.Slot),
		}); err != nil {
			logger.Error("record confirm_bank_payout activity", "pda", pda.String(), "err", err)
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "signature": res.Signature, "explorerUrl": txExplorer(res.Signature)})
	}
}
