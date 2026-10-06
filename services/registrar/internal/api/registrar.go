package api

// Registrar back-office writes (product spec §4): investor onboarding — the
// (SIMULATED) KYC provider attests the wallet on the Solana Attestation
// Service, then the registrar registers the investor on-chain — plus
// suspend/reinstate and the audit feed. The service holds no business logic:
// it validates, execs the qupon CLI and audits; on-chain preconditions
// surface as 409 with the CLI message.

import (
	"context"
	"net/http"
	"strconv"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// OnboardRequest is POST /registrar/investors (openapi.yaml OnboardRequest).
type OnboardRequest struct {
	Series       string `json:"series"`       // bond mint (base58)
	Owner        string `json:"owner"`        // investor wallet (base58)
	InvestorType string `json:"investorType"` // individual | legal_entity
	Residency    string `json:"residency"`    // resident | nonresident
	TaxBps       int    `json:"taxBps"`       // withholding tax, 0..10000
	ExpiryDays   *int   `json:"expiryDays"`   // KYC validity; default 365, 0 = no expiry
}

// writeOnchainError maps a CLI refusal (the chain said no) to 409 with the
// raw message in onchainError.
func writeOnchainError(w http.ResponseWriter, msg string) {
	writeJSON(w, http.StatusConflict, map[string]string{"code": "onchain", "message": msg, "error": msg, "onchainError": msg})
}

func needExecutor(w http.ResponseWriter, deps Deps) bool {
	if deps.Executor == nil {
		writeError(w, http.StatusServiceUnavailable, "executor not configured (set QUPON_CLI)")
		return false
	}
	return true
}

// seriesName resolves the CLI --series name for a bond mint; false = response written.
func seriesName(w http.ResponseWriter, deps Deps, mint string) (string, bool) {
	name, err := deps.Executor.SeriesName(mint)
	if err != nil {
		writeErrorCode(w, http.StatusNotFound, "unknown_series", err.Error())
		return "", false
	}
	return name, true
}

func sigsOf(sigs ...string) []string {
	out := make([]string, 0, len(sigs))
	for _, s := range sigs {
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

// registrarOnboard: kyc:attest (idempotent — skipped when the attestation
// exists) then investor:register; a failing attestation stops before register.
func registrarOnboard(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !needExecutor(w, deps) {
			return
		}
		var req OnboardRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		if _, err := solana.PublicKeyFromBase58(req.Series); err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "series must be a base58 mint")
			return
		}
		if _, err := solana.PublicKeyFromBase58(req.Owner); err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "owner must be a base58 pubkey")
			return
		}
		if req.InvestorType != "individual" && req.InvestorType != "legal_entity" {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "investorType must be individual or legal_entity")
			return
		}
		if req.Residency != "resident" && req.Residency != "nonresident" {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "residency must be resident or nonresident")
			return
		}
		if req.TaxBps < 0 || req.TaxBps > 10000 {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "taxBps must be 0..10000")
			return
		}
		expiryDays := 365
		if req.ExpiryDays != nil {
			if *req.ExpiryDays < 0 {
				writeErrorCode(w, http.StatusBadRequest, "invalid_params", "expiryDays must be >= 0")
				return
			}
			expiryDays = *req.ExpiryDays
		}
		name, ok := seriesName(w, deps, req.Series)
		if !ok {
			return
		}

		res, err := onboardInvestor(r.Context(), deps, name, req, expiryDays)
		if err != nil {
			writeError(w, http.StatusGatewayTimeout, err.Error())
			return
		}
		if res.Error != "" {
			audit(st, r, req, false, res.Error, res.Signatures)
			writeOnchainError(w, res.Error)
			return
		}
		audit(st, r, req, true, "onboarded", res.Signatures)
		writeJSON(w, http.StatusCreated, map[string]any{
			"investor": res.Investor, "attestation": res.Attestation, "signatures": res.Signatures,
		})
	}
}

// onboardResult is one kyc:attest + investor:register run. Error holds an on-chain refusal (the chain said no);
// executor failures (timeouts, no slot) come back as the function's error instead.
type onboardResult struct {
	Series      string   `json:"series"`
	Investor    string   `json:"investor,omitempty"`
	Attestation string   `json:"attestation,omitempty"`
	Signatures  []string `json:"signatures"`
	Error       string   `json:"error,omitempty"`
}

// onboardInvestor attests the owner (idempotent: skipped when the attestation exists) and registers them in the
// series called name. Shared by POST /registrar/investors and KYC approval (platform v2 §5.3).
func onboardInvestor(ctx context.Context, deps Deps, name string, req OnboardRequest, expiryDays int) (onboardResult, error) {
	out := onboardResult{Series: req.Series, Signatures: []string{}}
	att, err := deps.Executor.Run(ctx,
		"kyc:attest", "--owner", req.Owner, "--type", req.InvestorType,
		"--residency", req.Residency, "--tax-bps", strconv.Itoa(req.TaxBps),
		"--expiry-days", strconv.Itoa(expiryDays))
	if err != nil {
		return out, err
	}
	if !att.OK {
		out.Error = att.Error
		return out, nil
	}
	out.Attestation = att.Attestation
	reg, err := deps.Executor.Run(ctx,
		"investor:register", "--series", name, "--owner", req.Owner,
		"--type", req.InvestorType, "--residency", req.Residency,
		"--tax-bps", strconv.Itoa(req.TaxBps))
	if err != nil {
		return out, err
	}
	out.Signatures = sigsOf(att.Signature, reg.Signature)
	if !reg.OK {
		out.Error = reg.Error
		return out, nil
	}
	out.Investor = reg.Investor
	return out, nil
}

// registrarSuspend handles suspend and reinstate (verb selects the CLI command).
func registrarSuspend(deps Deps, st *store.Store, verb string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !needExecutor(w, deps) {
			return
		}
		mint, ok := pathKey(w, r, "mint")
		if !ok {
			return
		}
		owner, ok := pathKey(w, r, "owner")
		if !ok {
			return
		}
		name, ok := seriesName(w, deps, mint.String())
		if !ok {
			return
		}
		res, err := deps.Executor.Run(r.Context(),
			"investor:"+verb, "--series", name, "--owner", owner.String())
		if err != nil {
			writeError(w, http.StatusGatewayTimeout, err.Error())
			return
		}
		params := map[string]string{"series": name, "owner": owner.String()}
		if !res.OK {
			audit(st, r, params, false, res.Error, nil)
			writeOnchainError(w, res.Error)
			return
		}
		sigs := sigsOf(res.Signature)
		audit(st, r, params, true, verb, sigs)
		writeJSON(w, http.StatusOK, map[string]any{"signatures": sigs, "skipped": res.Skipped})
	}
}

// registrarAudit serves the back-office audit feed, newest first.
func registrarAudit(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit := 100
		if v := r.URL.Query().Get("limit"); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 1 || n > 500 {
				writeError(w, http.StatusBadRequest, "limit must be 1..500")
				return
			}
			limit = n
		}
		items, err := st.ListAudit(r.Context(), limit)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	}
}
