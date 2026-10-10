// KASE schedule check and disclosure package (platform v2 §5.5, task 1003):
// the registrar compares kase.kz's fixation date with the on-chain record date
// for the period, and exports one ZIP per action (notices EN/RU, seev.031,
// seev.036 per holder, manifest). "Submit to KASE" is SIMULATED: it records an
// audit row only — nothing is sent anywhere.
package api

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/disclosure"
	"github.com/qupon-kz/qupon/services/registrar/internal/iso20022"
	"github.com/qupon-kz/qupon/services/registrar/internal/kase"
	"github.com/qupon-kz/qupon/services/registrar/internal/notice"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// disclosureTimeout bounds one check/export (RPC retries + paced kase.kz fetches included).
const disclosureTimeout = 45 * time.Second

// disclosureDate renders an on-chain timestamp as an Almaty calendar date
// (the same zone as rest.go's almaty; KASE fixation dates compare against it).
func disclosureDate(unix int64) string { return civil(unix) }

func mountDisclosure(r chi.Router, deps Deps, st *store.Store) {
	r.Get("/actions/{pda}/kase-check", disclosureCheck(deps, st))
	r.Get("/actions/{pda}/disclosure.zip", disclosureZip(deps))
	r.Get("/actions/{pda}/disclosure-hash", disclosureHash(deps))
	// The browser write goes through /api/bo (registrar/… allowlist); the bare path is the API-side twin.
	r.With(requireRole(deps.Auth, "registrar")).Post("/actions/{pda}/disclosure/submit", disclosureSubmit(deps, st))
	r.With(requireRole(deps.Auth, "registrar")).Post("/registrar/actions/{pda}/disclosure/submit", disclosureSubmit(deps, st))
}

// kaseCheckDTO is the schedule-check answer: status ok carries the comparison,
// the other statuses say why there is nothing to compare.
type kaseCheckDTO struct {
	Status       string              `json:"status"` // ok | no_ticker | no_period | no_schedule
	ActionPda    string              `json:"actionPda"`
	Ticker       string              `json:"ticker,omitempty"`
	RecordDate   string              `json:"recordDate,omitempty"`
	KaseFixation string              `json:"kaseFixation,omitempty"`
	Period       *kasePeriodDTO      `json:"period,omitempty"`
	KasePeriod   *kase.ScheduleEntry `json:"kasePeriod,omitempty"`
	Match        bool                `json:"match"`
	Stale        bool                `json:"stale"`
	FetchedAt    string              `json:"fetchedAt,omitempty"`
}

type kasePeriodDTO struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// matchKaseSchedule picks the kase.kz coupon row for an action: the row whose
// period contains the on-chain period, else the row containing the record
// date, else the first row ending on/after it. Dates compare as YYYY-MM-DD
// strings. ok=false when the schedule has no usable row.
func matchKaseSchedule(entries []kase.ScheduleEntry, periodStart, periodEnd, recordDate string) (kase.ScheduleEntry, bool) {
	for _, e := range entries {
		if e.Start != "" && e.End != "" && e.Start <= periodStart && e.End >= periodEnd {
			return e, true
		}
	}
	for _, e := range entries {
		if e.Start != "" && e.End != "" && e.Start <= recordDate && e.End >= recordDate {
			return e, true
		}
	}
	for _, e := range entries {
		if e.End >= recordDate {
			return e, true
		}
	}
	return kase.ScheduleEntry{}, false
}

// disclosureCheck serves GET /actions/{pda}/kase-check (spec §5.5: fixation date
// vs record date for the period). Failures of kase.kz surface as kase_unavailable,
// never as a broken page: the client renders its unavailable state.
func disclosureCheck(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pda, err := solana.PublicKeyFromBase58(chi.URLParam(r, "pda"))
		if err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_action", "invalid action pda")
			return
		}
		if deps.Chain == nil {
			writeErrorCode(w, http.StatusServiceUnavailable, "chain_unavailable", "chain reader not configured")
			return
		}
		if deps.Kase == nil {
			writeErrorCode(w, http.StatusServiceUnavailable, "kase_unavailable", "kase client not configured")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), disclosureTimeout)
		defer cancel()
		act, err := deps.Chain.FetchCorporateAction(ctx, pda)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		if act == nil {
			writeErrorCode(w, http.StatusNotFound, "action_not_found", "action account not found")
			return
		}
		series, err := deps.Chain.FetchSeries(ctx, act.Series)
		if err != nil || series == nil {
			writeError(w, http.StatusBadGateway, fmt.Sprintf("series %s not found", act.Series))
			return
		}
		// The settings row is keyed by the bond mint (admin series panel writes it).
		settings, err := st.GetSeriesSettings(ctx, series.Mint.String())
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		record := disclosureDate(act.RecordAt)
		out := kaseCheckDTO{ActionPda: pda.String(), RecordDate: record, Ticker: settings.KaseTicker}
		if settings.KaseTicker == "" {
			out.Status = "no_ticker"
			writeJSON(w, http.StatusOK, out)
			return
		}
		if act.PeriodStart == 0 || act.PeriodEnd == 0 {
			out.Status = "no_period"
			writeJSON(w, http.StatusOK, out)
			return
		}
		bond, err := deps.Kase.Bond(ctx, settings.KaseTicker)
		if err != nil {
			writeErrorCode(w, http.StatusBadGateway, "kase_unavailable", "kase.kz is unavailable")
			return
		}
		start, end := disclosureDate(act.PeriodStart), disclosureDate(act.PeriodEnd)
		out.Period = &kasePeriodDTO{Start: start, End: end}
		out.Stale, out.FetchedAt = bond.Stale, bond.FetchedAt
		entry, ok := matchKaseSchedule(bond.Schedule, start, end, record)
		if !ok {
			out.Status = "no_schedule"
			writeJSON(w, http.StatusOK, out)
			return
		}
		out.Status = "ok"
		out.KaseFixation = entry.RecordDate
		out.KasePeriod = &entry
		out.Match = entry.RecordDate == record
		writeJSON(w, http.StatusOK, out)
	}
}

// disclosureZip serves GET /actions/{pda}/disclosure.zip: notices EN/RU,
// seev.031, one seev.036 per holder and a manifest. Mirrors the notice
// endpoint's gates (409 until the action is settled — a notice reports a
// completed payment).
func disclosureZip(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pda, err := solana.PublicKeyFromBase58(chi.URLParam(r, "pda"))
		if err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_action", "invalid action pda")
			return
		}
		if deps.Chain == nil || deps.Notice == nil {
			writeErrorCode(w, http.StatusServiceUnavailable, "chain_unavailable", "chain reader not configured")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), disclosureTimeout)
		defer cancel()
		noticeEn, err := deps.Notice.Notice(ctx, pda, "en")
		if err != nil {
			writeDisclosureNoticeError(w, err)
			return
		}
		noticeRu, err := deps.Notice.Notice(ctx, pda, "ru")
		if err != nil {
			writeDisclosureNoticeError(w, err)
			return
		}
		noticeKk, err := deps.Notice.Notice(ctx, pda, "kk")
		if err != nil {
			writeDisclosureNoticeError(w, err)
			return
		}
		act, series, err := fetchActionSeries(ctx, deps.Chain, pda)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		if act == nil {
			writeErrorCode(w, http.StatusNotFound, "action_not_found", "action account not found")
			return
		}
		ents, err := deps.Chain.FetchEntitlementsByAction(ctx, pda)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		if len(ents) == 0 {
			writeErrorCode(w, http.StatusNotFound, "no_entitlements", "no entitlements snapshotted for this action")
			return
		}
		cash, err := cashInfo(ctx, deps.Chain, act)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}

		corpID := iso20022.CorpID(act)
		files := []map[string]string{
			{"name": "notice.en.txt", "kind": "notice_en"},
			{"name": "notice.ru.txt", "kind": "notice_ru"},
			{"name": "notice.kk.txt", "kind": "notice_kk"},
			{"name": fmt.Sprintf("seev031.%s.xml", corpID), "kind": "seev031"},
		}
		for _, rec := range ents {
			files = append(files, map[string]string{
				"name": fmt.Sprintf("seev036.%s.%s.xml", corpID, rec.Entitlement.Owner),
				"kind": "seev036",
			})
		}
		manifest := map[string]any{
			"actionPda": pda.String(), "corpId": corpID, "series": series.Mint.String(),
			"kind": int(act.Kind), "recordDate": disclosureDate(act.RecordAt),
			"paymentDate": disclosureDate(act.PaymentAt), "generatedAt": time.Now().UTC().Format(time.RFC3339),
			// SIMULATED: this package is a devnet disclosure artefact; kase.kz submission is audit-row only.
			"simulated": true, "files": files,
		}

		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=disclosure.%s.zip", corpID))
		zw := zip.NewWriter(w)
		add := func(name string, body []byte) bool {
			fw, err := zw.Create(name)
			if err != nil {
				_ = zw.Close()
				return false
			}
			if _, err := fw.Write(body); err != nil && !errors.Is(err, context.Canceled) {
				_ = zw.Close()
				return false
			}
			return true
		}
		if !add("notice.en.txt", []byte(noticeEn)) || !add("notice.ru.txt", []byte(noticeRu)) ||
			!add("notice.kk.txt", []byte(noticeKk)) {
			return
		}
		// The anchored seev.031 (D9): deterministic bytes — the same file whose sha256
		// disclosure:attach put on the action and GET /actions/{pda}/disclosure-hash checks.
		body031, err := disclosure.Anchored(act, series, deps.Chain.ProgramID().String())
		if err != nil {
			_ = zw.Close()
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		if !add(files[3]["name"], body031) {
			return
		}
		for _, rec := range ents {
			doc, err := buildHolderSeev036(ctx, deps.Chain, act, series, rec.Entitlement, cash)
			if err != nil {
				_ = zw.Close()
				return
			}
			body, err := iso20022.Marshal(doc)
			if err != nil || !add(fmt.Sprintf("seev036.%s.%s.xml", corpID, rec.Entitlement.Owner), body) {
				return
			}
		}
		manifestBody, err := json.Marshal(manifest)
		if err != nil || !add("manifest.json", manifestBody) {
			return
		}
		_ = zw.Close()
	}
}

// disclosureSubmit serves POST /actions/{pda}/disclosure/submit — SIMULATED
// "Submit to KASE": records an audit row only, sends nothing anywhere.
func disclosureSubmit(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pda, err := solana.PublicKeyFromBase58(chi.URLParam(r, "pda"))
		if err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_action", "invalid action pda")
			return
		}
		if deps.Chain == nil {
			writeErrorCode(w, http.StatusServiceUnavailable, "chain_unavailable", "chain reader not configured")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		act, err := deps.Chain.FetchCorporateAction(ctx, pda)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		if act == nil {
			writeErrorCode(w, http.StatusNotFound, "action_not_found", "action account not found")
			return
		}
		audit(st, r, map[string]any{"pda": pda.String(), "corpId": iso20022.CorpID(act)},
			true, "disclosure package submitted to KASE (SIMULATED: audit row only, nothing is sent)", nil)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "simulated": true})
	}
}

// disclosureHashDTO answers GET /actions/{pda}/disclosure-hash (plan 15 D9):
// the re-computed hash of the deterministic seev.031 this service serves, the
// hash anchored on the action, and whether they match. match=false with an
// empty onchain means "not anchored (yet)"; false with a hash means mismatch.
type disclosureHashDTO struct {
	Hash    string `json:"hash"`    // sha256 hex of the deterministic seev.031
	Onchain string `json:"onchain"` // sha256 hex anchored on the action; "" when absent
	Match   bool   `json:"match"`
}

// disclosureHash serves GET /actions/{pda}/disclosure-hash.
func disclosureHash(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pda, err := solana.PublicKeyFromBase58(chi.URLParam(r, "pda"))
		if err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_action", "invalid action pda")
			return
		}
		if deps.Chain == nil {
			writeErrorCode(w, http.StatusServiceUnavailable, "chain_unavailable", "chain reader not configured")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), disclosureTimeout)
		defer cancel()
		act, series, err := fetchActionSeries(ctx, deps.Chain, pda)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		if act == nil {
			writeErrorCode(w, http.StatusNotFound, "action_not_found", "action account not found")
			return
		}
		body, err := disclosure.Anchored(act, series, deps.Chain.ProgramID().String())
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		out := disclosureHashDTO{Hash: disclosure.Hash(body), Onchain: disclosure.OnchainHash(act)}
		out.Match = out.Onchain != "" && out.Onchain == out.Hash
		writeJSON(w, http.StatusOK, out)
	}
}

func writeDisclosureNoticeError(w http.ResponseWriter, err error) {
	if errors.Is(err, notice.ErrActionNotFound) {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	if errors.Is(err, notice.ErrNotYetSettled) {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	writeError(w, http.StatusBadGateway, err.Error())
}
