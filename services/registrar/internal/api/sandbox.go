package api

// The judge sandbox endpoints (plan 15, task 1524) on the 1532 web contract (apps/web/src/lib/sandbox.ts,
// openapi.yaml #/paths/demo): POST /demo/sandbox creates a bond on a demo clock, GET /demo/sandbox/{id} is
// the page's poll, POST /demo/sandbox/{id}/scenario runs a judge scenario. No session: the visitor is
// identified by the qupon_sandbox cookie (set on create, 24 h) and rate-limited on clientIP (auth.go) — the
// LAST X-Forwarded-For entry, the one Caddy appends; the first is visitor-controlled and never gates a limit.

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/network"
	"github.com/qupon-kz/qupon/services/registrar/internal/sandbox"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// SandboxCookie is the httpOnly cookie that attaches a visitor to their sandbox (value = its id, 24 h).
const SandboxCookie = "qupon_sandbox"

func sandboxCookieID(r *http.Request) string {
	if c, err := r.Cookie(SandboxCookie); err == nil {
		return c.Value
	}
	return ""
}

// mount: sandbox
func mountSandbox(r chi.Router, deps Deps, st *store.Store) {
	r.Post("/demo/sandbox", sandboxCreate(deps, st))
	r.Get("/demo/sandbox/{id}", sandboxGet(deps, st))
	r.Post("/demo/sandbox/{id}/scenario", sandboxScenario(deps, st))
}

func needSandbox(w http.ResponseWriter, deps Deps) *sandbox.Service {
	if deps.Sandbox == nil {
		writeErrorCode(w, http.StatusServiceUnavailable, "sandbox_off", "sandbox API not configured (devnet + executor)")
		return nil
	}
	return deps.Sandbox
}

// sandboxClock is the demo clock of the web contract: one civil day lasts DaySecs seconds from IssueTs.
type sandboxClock struct {
	DaySecs uint32 `json:"daySecs"`
	IssueTs int64  `json:"issueTs"`
}

type sandboxLinks struct {
	Bond     string `json:"bond"`
	Explorer string `json:"explorer"`
}

func linksOf(mint string) sandboxLinks {
	return sandboxLinks{Bond: "/bonds/" + mint, Explorer: network.ExplorerURL("address", mint)}
}

// POST /demo/sandbox — 201 SandboxCreated (the cookie attaches the visitor); 429 demo_throttled;
// 400 bad_wallet; 502 executor_failed. Idempotent per requestId.
func sandboxCreate(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		svc := needSandbox(w, deps)
		if svc == nil {
			return
		}
		if deps.Read == nil {
			writeError(w, http.StatusServiceUnavailable, "chain reader not configured (set PROGRAM_ID)")
			return
		}
		var req struct {
			Wallet    string `json:"wallet"`
			RequestID string `json:"requestId"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "body must be {wallet?, requestId}: "+err.Error())
			return
		}
		created, err := svc.Create(r.Context(), req.Wallet, req.RequestID, clientIP(r))
		switch {
		case err == nil:
		case errors.Is(err, sandbox.ErrThrottled):
			writeErrorCode(w, http.StatusTooManyRequests, "demo_throttled", err.Error())
			return
		case errors.Is(err, sandbox.ErrBadWallet):
			writeErrorCode(w, http.StatusBadRequest, "bad_wallet", err.Error())
			return
		case errors.Is(err, sandbox.ErrExecutor):
			writeErrorCode(w, http.StatusBadGateway, "executor_failed", err.Error())
			return
		default:
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}

		// The response carries the live series view (clock, schedule) from the chain it was just minted on.
		out, status, err := sandboxView(r, deps, st, created.ID)
		if err != nil {
			writeError(w, status, err.Error())
			return
		}
		http.SetCookie(w, &http.Cookie{
			Name: SandboxCookie, Value: created.ID, Path: "/", HttpOnly: true,
			MaxAge: 24 * 3600, SameSite: http.SameSiteLaxMode,
		})
		writeJSON(w, http.StatusCreated, map[string]any{
			"id": created.ID, "mint": created.Mint, "ticker": created.Ticker,
			"clock": out.Clock, "schedule": out.Schedule, "links": out.Links,
		})
	}
}

// GET /demo/sandbox/{id} — the sandbox page's poll; 404 sandbox_not_found (unknown or expired after 24 h).
func sandboxGet(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if needSandbox(w, deps) == nil {
			return
		}
		if deps.Read == nil {
			writeError(w, http.StatusServiceUnavailable, "chain reader not configured (set PROGRAM_ID)")
			return
		}
		out, status, err := sandboxView(r, deps, st, chi.URLParam(r, "id"))
		if err != nil {
			writeError(w, status, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// POST /demo/sandbox/{id}/scenario — 200 SandboxScenario; 404 sandbox_not_found; 409 scenario_unavailable.
func sandboxScenario(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		svc := needSandbox(w, deps)
		if svc == nil {
			return
		}
		var req struct {
			Kind string `json:"kind"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&req); err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "body must be {kind}: "+err.Error())
			return
		}
		out, err := svc.Scenario(r.Context(), chi.URLParam(r, "id"), req.Kind)
		switch {
		case err == nil:
			writeJSON(w, http.StatusOK, out)
		case errors.Is(err, sandbox.ErrNotFound):
			writeErrorCode(w, http.StatusNotFound, "sandbox_not_found", "sandbox not found or expired")
		case errors.Is(err, sandbox.ErrUnavailable):
			writeErrorCode(w, http.StatusConflict, "scenario_unavailable", err.Error())
		case errors.Is(err, sandbox.ErrExecutor):
			writeErrorCode(w, http.StatusBadGateway, "executor_failed", err.Error())
		case strings.Contains(err.Error(), "bad_kind"):
			writeErrorCode(w, http.StatusBadRequest, "bad_kind", err.Error())
		default:
			writeError(w, http.StatusInternalServerError, err.Error())
		}
	}
}

// sandboxView assembles GET /demo/sandbox/{id}'s payload: the stored sandbox row (holders, scenarios,
// claim window) joined with the live chain read models of rest.go (series, actions, entitlements).
func sandboxView(r *http.Request, deps Deps, st *store.Store, id string) (*sandboxDetail, int, error) {
	x, err := st.SandboxByID(r.Context(), id)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}
	if x == nil {
		return nil, http.StatusNotFound, errors.New("sandbox_not_found: sandbox not found or expired")
	}
	mint, err := solana.PublicKeyFromBase58(x.Mint)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}
	pda, err := deps.Read.SeriesPDA(mint)
	if err != nil {
		return nil, http.StatusBadGateway, err
	}
	series, err := deps.Read.FetchSeries(r.Context(), pda)
	if err != nil || series == nil {
		return nil, http.StatusBadGateway, err
	}
	m, err := cashMoney(r.Context(), deps.Read, st, series.CashMint)
	if err != nil {
		return nil, http.StatusBadGateway, err
	}
	actions, err := deps.Read.FetchActionsBySeries(r.Context(), pda)
	if err != nil {
		return nil, http.StatusBadGateway, err
	}

	now := time.Now()
	d := &sandboxDetail{
		ID:         x.ID,
		Clock:      sandboxClock{DaySecs: series.DaySecs, IssueTs: series.IssueDate},
		ServerTime: now.UnixMilli(),
		ExpiresAt:  x.ExpiresAt * 1000,
		Autofund:   !x.SkipFunding,
		Series:     seriesDTO(pda, series, m, false),
		Schedule:   []ScheduleItem{},
		Actions:    []ActionDTO{},
		Holders:    []sandboxHolderView{},
		Activity:   []sandboxActivityView{},
		Scenarios:  []json.RawMessage{},
		Links:      linksOf(x.Mint),
	}
	if x.Wallet != "" {
		d.Wallet = &x.Wallet
	}
	if items, err := schedule(series, actions, m); err == nil {
		d.Schedule = items
	}
	for _, rec := range actions {
		d.Actions = append(d.Actions, actionDTO(rec.PDA, rec.Action, series.Mint, m))
	}

	// Holders: the stored labels, with live units off the chain (trades move them between coupons).
	owners := map[string]*sandboxHolderView{}
	for _, h := range x.Holders {
		v := sandboxHolderView{Owner: h.Owner, Label: h.Label, Units: strconv.FormatUint(h.Units, 10),
			Route: h.Route, TaxRateBps: h.TaxRateBps, Kind: h.Kind}
		owners[h.Owner] = &v
		d.Holders = append(d.Holders, v)
	}
	if invs, err := deps.Read.FetchInvestorsBySeries(r.Context(), pda); err == nil {
		for _, rec := range invs {
			v, ok := owners[rec.Investor.Owner.String()]
			if !ok {
				continue
			}
			if ta, err := deps.Read.FetchTokenAccount(r.Context(), rec.Investor.BondATA); err == nil && ta != nil {
				v.Units = strconv.FormatUint(ta.Amount, 10)
			}
		}
	}

	// Entitlements of the open action, else the latest one; rows appear as the snapshot runs.
	if open := openAction(actions); open != nil {
		d.Entitlements = entitlementsOf(r, deps, open.PDA, m)
	} else if n := len(actions); n > 0 {
		d.Entitlements = entitlementsOf(r, deps, actions[n-1].PDA, m)
	}
	d.Next = sandboxNext(r.Context(), series, openAction(actions), x.SkipFunding, now, deps.Read)

	if rows, err := st.ListSeriesActivity(r.Context(), x.Mint, 100); err == nil {
		for i := len(rows) - 1; i >= 0; i-- { // newest first
			d.Activity = append(d.Activity, sandboxActivityView{
				ID: rows[i].ID, Ts: rows[i].Ts, Kind: rows[i].Kind, Sig: rows[i].Sig,
				Slot: rows[i].Slot, ActionPDA: rows[i].ActionPDA, Payload: rows[i].Payload,
				ExplorerURL: txExplorer(rows[i].Sig),
			})
		}
	}
	if rows, err := st.ListSandboxScenarios(r.Context(), x.ID); err == nil {
		for i := len(rows) - 1; i >= 0; i-- { // newest first
			d.Scenarios = append(d.Scenarios, json.RawMessage(rows[i].Detail))
		}
	}
	return d, 0, nil
}

// openAction is the first action that is neither Completed nor Cancelled, else nil.
func openAction(actions []chain.ActionRecord) *chain.ActionRecord {
	for i := range actions {
		if a := actions[i].Action; a.Status != 5 && a.Status != 7 {
			return &actions[i]
		}
	}
	return nil
}

func entitlementsOf(r *http.Request, deps Deps, pda solana.PublicKey, m money) []EntitlementDTO {
	recs, err := deps.Read.FetchEntitlementsByAction(r.Context(), pda)
	if err != nil {
		return []EntitlementDTO{}
	}
	out := make([]EntitlementDTO, 0, len(recs))
	for _, rec := range recs {
		e := rec.Entitlement
		out = append(out, EntitlementDTO{
			PDA: rec.PDA.String(), ActionPDA: pda.String(), Owner: e.Owner.String(),
			Units: strconv.FormatUint(e.Units, 10), Gross: m.amount(e.Gross), Tax: m.amount(e.Tax),
			Net: m.amount(e.Net), Principal: m.amount(e.Principal), Status: pick(entitlementStatusNames, e.Status),
			PaidAt: optDateTime(e.PaidAt), Vote: pick(voteNames, e.Vote), VotedAt: optDateTime(e.VotedAt),
			ExplorerURL: explorer(rec.PDA),
		})
	}
	return out
}

// sandboxDetail is GET /demo/sandbox/{id}'s payload (openapi.yaml Sandbox): every date-time a real instant,
// amounts {minor, display, currency}, times in ms where the contract says so.
type sandboxDetail struct {
	ID           string                `json:"id"`
	Clock        sandboxClock          `json:"clock"`
	ServerTime   int64                 `json:"serverTime"`
	ExpiresAt    int64                 `json:"expiresAt"`
	Wallet       *string               `json:"wallet"`
	Autofund     bool                  `json:"autofund"`
	Series       SeriesDTO             `json:"series"`
	Schedule     []ScheduleItem        `json:"schedule"`
	Actions      []ActionDTO           `json:"actions"`
	Holders      []sandboxHolderView   `json:"holders"`
	Entitlements []EntitlementDTO      `json:"entitlements"`
	Next         sandboxNextView       `json:"next"`
	Activity     []sandboxActivityView `json:"activity"`
	Scenarios    []json.RawMessage     `json:"scenarios"`
	Links        sandboxLinks          `json:"links"`
}

type sandboxHolderView struct {
	Owner      string `json:"owner"`
	Label      string `json:"label"`
	Units      string `json:"units"`
	Route      string `json:"route"`
	TaxRateBps int    `json:"taxRateBps"`
	Kind       string `json:"kind"`
}

type sandboxActivityView struct {
	ID          int64           `json:"id"`
	Ts          int64           `json:"ts"`
	Kind        string          `json:"kind"`
	Sig         string          `json:"sig"`
	Slot        uint64          `json:"slot"`
	ActionPDA   *string         `json:"actionPda"`
	Payload     json.RawMessage `json:"payload"`
	ExplorerURL *string         `json:"explorerUrl"`
}

type sandboxNextView struct {
	Step  string  `json:"step"`
	Actor *string `json:"actor"`
	At    *int64  `json:"at"` // unix ms when it becomes possible; null = now
}

// sandboxNext is what the autopilot pushes next, in the web contract's step ids (mock STEP_OF). The gates
// mirror scheduler.Decide: record date, payment date, default due; null when the bond's life is over.
func sandboxNext(ctx context.Context, s *chain.Series, open *chain.ActionRecord, skipFunding bool, now time.Time, read ReadModel) sandboxNextView {
	stepOf := map[string]string{
		"strike_record": "strike", "snapshot_batch": "snapshot", "finalize_snapshot": "finalize",
		"fund_action": "fund", "pay_batch": "pay", "complete_action": "complete", "retire_batch": "complete",
		"close_series": "close", "declare_default": "declare_default",
	}
	actorOf := map[string]string{"fund": "issuer", "announce": "registrar", "confirm_bank": "payingAgent"}
	mk := func(step string, at *int64) sandboxNextView {
		actor := actorOf[step]
		if actor == "" {
			actor = "anyone"
		}
		return sandboxNextView{Step: step, Actor: &actor, At: at}
	}
	ms := func(ts int64) *int64 { v := ts * 1000; return &v }

	if open == nil {
		if s.Status != 0 {
			return sandboxNextView{}
		}
		day := int64(86_400)
		if s.DaySecs > 0 {
			day = int64(s.DaySecs)
		}
		return mk("announce", ms(s.NextCouponDate-5*day)) // the scheduler's 5 series-day announce lead
	}
	a := open.Action
	if a.Status == 0 && now.Unix() < a.RecordAt {
		step := "strike"
		if s.Hook == 1 {
			step = "snapshot" // D1': the transfer-hook gate replaces the strike
		}
		return mk(step, ms(a.RecordAt))
	}
	if a.Status == 3 && now.Unix() < a.PaymentAt {
		return mk("pay", ms(a.PaymentAt))
	}
	if a.BankPending > 0 && a.HoldersPaid >= a.HoldersSnapshotted {
		return mk("confirm_bank", nil)
	}
	// NextStep with autofund = what the autopilot will run (skip_funding turns its funding off).
	autofund := !skipFunding
	supply := uint64(0)
	if mintAccount, err := read.FetchMint(ctx, s.Mint); err == nil && mintAccount != nil {
		supply = mintAccount.Supply
	}
	if step, _ := executor.NextStep(a, s, supply, now, autofund); step != "" {
		if web, ok := stepOf[step]; ok {
			return mk(web, nil)
		}
	}
	if a.Status == 2 && !autofund {
		return mk("declare_default", ms(executor.DefaultDue(a, s)))
	}
	return sandboxNextView{}
}
