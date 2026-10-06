package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// kycRequest is POST /me/kyc. Review is SIMULATED: no KYC vendor, a registrar decides by hand.
type kycRequest struct {
	Wallet       string   `json:"wallet"`
	InvestorType string   `json:"investorType"`
	Residency    string   `json:"residency"`
	TaxBps       int      `json:"taxBps"`
	FullName     string   `json:"fullName"`
	DocumentIDs  []int64  `json:"documentIds"`
	SeriesMints  []string `json:"seriesMints"`
}

func (req *kycRequest) validate() error {
	if req.InvestorType != "individual" && req.InvestorType != "legal_entity" {
		return errors.New("investorType must be individual or legal_entity")
	}
	if req.Residency != "resident" && req.Residency != "nonresident" {
		return errors.New("residency must be resident or nonresident")
	}
	if req.TaxBps < 0 || req.TaxBps > 10000 {
		return errors.New("taxBps must be 0..10000")
	}
	req.FullName = strings.TrimSpace(req.FullName)
	if n := len([]rune(req.FullName)); n < 2 || n > 120 {
		return errors.New("fullName must be 2-120 characters")
	}
	if len(req.DocumentIDs) == 0 || len(req.DocumentIDs) > 10 {
		return errors.New("attach 1-10 documents")
	}
	if len(req.SeriesMints) == 0 || len(req.SeriesMints) > 10 {
		return errors.New("choose 1-10 series to join")
	}
	for _, m := range req.SeriesMints {
		if _, err := solana.PublicKeyFromBase58(m); err != nil {
			return errors.New("seriesMints must be base58 mints")
		}
	}
	return nil
}

// kycDetail is an application with its documents' metadata (never their bytes).
type kycDetail struct {
	store.KycApplication
	Documents []store.Document `json:"documents"`
}

func withDocs(r *http.Request, st *store.Store, a store.KycApplication) (kycDetail, error) {
	docs, err := st.ListDocumentsByIDs(r.Context(), a.DocIDs)
	return kycDetail{KycApplication: a, Documents: docs}, err
}

func kycID(w http.ResponseWriter, r *http.Request, st *store.Store) (store.KycApplication, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err == nil {
		a, err := st.GetKyc(r.Context(), id)
		if err == nil {
			return a, true
		}
		if !errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusInternalServerError, err.Error())
			return store.KycApplication{}, false
		}
	}
	writeErrorCode(w, http.StatusNotFound, "not_found", "no such application")
	return store.KycApplication{}, false
}

// mountKyc: investor applications and the registrar's review queue (platform v2 §5.3).
func mountKyc(r chi.Router, deps Deps, st *store.Store) {
	user := requireUser(deps.Auth)
	registrar := requireRole(deps.Auth, "registrar")
	write := demoThrottle(deps.DemoLimit, "demo:")

	r.With(user).Post("/me/kyc", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		if u.IsDemo || u.Role != "investor" {
			writeErrorCode(w, http.StatusForbidden, "forbidden", "only self-registered investors apply for KYC")
			return
		}
		var req kycRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		if err := req.validate(); err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", err.Error())
			return
		}
		wallets, err := st.ListWallets(r.Context(), u.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		owned := false
		for _, wl := range wallets {
			owned = owned || wl.Address == req.Wallet
		}
		if !owned {
			writeErrorCode(w, http.StatusBadRequest, "wallet_not_linked", "link the wallet to your account first")
			return
		}
		hasID := false
		for _, id := range req.DocumentIDs {
			d, err := st.GetDocument(r.Context(), id)
			if err != nil || d.OwnerUserID != u.ID {
				writeErrorCode(w, http.StatusBadRequest, "invalid_params", "documents must be your own uploads")
				return
			}
			hasID = hasID || d.Kind == "id_document"
		}
		if !hasID {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "attach an identity document")
			return
		}
		a, err := st.CreateKyc(r.Context(), store.KycApplication{
			UserID: u.ID, Wallet: req.Wallet, InvestorType: req.InvestorType, Residency: req.Residency,
			TaxBps: req.TaxBps, FullName: req.FullName, DocIDs: req.DocumentIDs, SeriesMints: req.SeriesMints,
		})
		if errors.Is(err, store.ErrKycPending) {
			writeErrorCode(w, http.StatusConflict, "kyc_pending", "an application is already under review")
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		audit(st, r, map[string]any{"application": a.ID}, true, "kyc submitted", nil)
		writeJSON(w, http.StatusCreated, map[string]any{"application": a})
	})

	r.With(user).Get("/me/kyc", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		a, err := st.LatestKyc(r.Context(), u.ID)
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusOK, map[string]any{"application": nil})
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		d, err := withDocs(r, st, a)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"application": d})
	})

	r.With(registrar).Get("/registrar/kyc", func(w http.ResponseWriter, r *http.Request) {
		status := r.URL.Query().Get("status")
		if status != "" && status != "submitted" && status != "approved" && status != "rejected" {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "status must be submitted, approved or rejected")
			return
		}
		list, err := st.ListKyc(r.Context(), status)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"applications": list})
	})

	r.With(registrar).Get("/registrar/kyc/{id}", func(w http.ResponseWriter, r *http.Request) {
		a, ok := kycID(w, r, st)
		if !ok {
			return
		}
		d, err := withDocs(r, st, a)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"application": d})
	})

	// Approve: attest + register the wallet in every requested series. All succeed → approved; any failure keeps
	// the application under review with per-series results, so the registrar can retry (both steps idempotent).
	r.With(registrar, write).Post("/registrar/kyc/{id}/approve", func(w http.ResponseWriter, r *http.Request) {
		if !needExecutor(w, deps) {
			return
		}
		a, ok := kycID(w, r, st)
		if !ok {
			return
		}
		if a.Status != "submitted" {
			writeErrorCode(w, http.StatusConflict, "kyc_decided", "application already "+a.Status)
			return
		}
		results := make([]onboardResult, 0, len(a.SeriesMints))
		allOK := true
		var sigs []string
		for _, mint := range a.SeriesMints {
			req := OnboardRequest{Series: mint, Owner: a.Wallet, InvestorType: a.InvestorType,
				Residency: a.Residency, TaxBps: a.TaxBps}
			name, err := deps.Executor.SeriesName(mint)
			if err != nil {
				results = append(results, onboardResult{Series: mint, Signatures: []string{}, Error: "unknown series"})
				allOK = false
				continue
			}
			res, err := onboardInvestor(r.Context(), deps, name, req, 365)
			if err != nil {
				res.Error = err.Error()
			}
			allOK = allOK && res.Error == ""
			sigs = append(sigs, res.Signatures...)
			results = append(results, res)
		}
		raw, _ := json.Marshal(results)
		u, _ := auth.UserFrom(r.Context())
		if !allOK {
			if err := st.RecordKycResults(r.Context(), a.ID, raw); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			audit(st, r, map[string]any{"application": a.ID}, false, "kyc approval incomplete", sigs)
			writeJSON(w, http.StatusOK, map[string]any{"ok": false, "status": "submitted", "results": results})
			return
		}
		if err := st.DecideKyc(r.Context(), a.ID, "approved", "", raw, u.ID, time.Now().Unix()); err != nil {
			writeErrorCode(w, http.StatusConflict, "kyc_decided", err.Error())
			return
		}
		_ = st.Notify(r.Context(), a.UserID, "kyc_decision",
			map[string]any{"application": a.ID, "status": "approved", "series": a.SeriesMints}, "kyc:"+strconv.FormatInt(a.ID, 10))
		audit(st, r, map[string]any{"application": a.ID}, true, "kyc approved", sigs)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": "approved", "results": results, "signatures": sigsOf(sigs...)})
	})

	r.With(registrar).Post("/registrar/kyc/{id}/reject", func(w http.ResponseWriter, r *http.Request) {
		a, ok := kycID(w, r, st)
		if !ok {
			return
		}
		var req struct {
			Reason string `json:"reason"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		req.Reason = strings.TrimSpace(req.Reason)
		if n := len([]rune(req.Reason)); n < 1 || n > 500 {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "reason must be 1-500 characters")
			return
		}
		u, _ := auth.UserFrom(r.Context())
		if err := st.DecideKyc(r.Context(), a.ID, "rejected", req.Reason, nil, u.ID, time.Now().Unix()); errors.Is(err, store.ErrKycDecided) {
			writeErrorCode(w, http.StatusConflict, "kyc_decided", "application already "+a.Status)
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		_ = st.Notify(r.Context(), a.UserID, "kyc_decision",
			map[string]any{"application": a.ID, "status": "rejected", "reason": req.Reason}, "kyc:"+strconv.FormatInt(a.ID, 10))
		audit(st, r, map[string]any{"application": a.ID}, true, "kyc rejected", nil)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": "rejected"})
	})
}
