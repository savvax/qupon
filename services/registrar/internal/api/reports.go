package api

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/reports"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

func ymdAlmaty(ts int64) string {
	if ts == 0 {
		return ""
	}
	return time.Unix(ts, 0).In(almaty).Format("2006-01-02")
}

// payoutRow converts one entitlement of an action into a report row.
func payoutRow(s *chain.Series, actionPDA solana.PublicKey, a *chain.CorporateAction, e *chain.Entitlement, m money) reports.Payout {
	p := reports.Payout{
		Series: trimBytes(s.Ticker[:]), ISIN: trimBytes(s.ISIN[:]), Kind: pick(kindNames, a.Kind),
		CorpID: trimBytes(a.CorpID[:]), Action: actionPDA.String(), Owner: e.Owner.String(),
		RecordDate: ymdAlmaty(a.RecordAt), PaymentDate: ymdAlmaty(a.PaymentAt), Units: e.Units,
		Gross: e.Gross, Tax: e.Tax, Net: e.Net, Principal: e.Principal,
		Status: pick(entitlementStatusNames, e.Status), Currency: m.currency, Decimals: m.decimals,
	}
	if e.PaidAt != 0 {
		t := time.Unix(e.PaidAt, 0).In(almaty)
		p.PaidAt, p.PaidYear = t.Format(time.RFC3339), t.Year()
	}
	return p
}

// ownerPayouts walks every series and action and keeps the entitlements of the given owners.
func ownerPayouts(ctx context.Context, rm ReadModel, st *store.Store, owners map[string]bool) ([]reports.Payout, error) {
	out := []reports.Payout{}
	if len(owners) == 0 {
		return out, nil
	}
	series, err := rm.AllSeries(ctx)
	if err != nil {
		return nil, err
	}
	for _, sr := range series {
		m, err := cashMoney(ctx, rm, st, sr.Series.CashMint)
		if err != nil {
			return nil, err
		}
		actions, err := rm.FetchActionsBySeries(ctx, sr.PDA)
		if err != nil {
			return nil, err
		}
		for _, ar := range actions {
			ents, err := rm.FetchEntitlementsByAction(ctx, ar.PDA)
			if err != nil {
				return nil, err
			}
			for _, er := range ents {
				if owners[er.Entitlement.Owner.String()] {
					out = append(out, payoutRow(sr.Series, ar.PDA, ar.Action, er.Entitlement, m))
				}
			}
		}
	}
	return out, nil
}

// userOwners is the set of a user's verified wallets.
func userOwners(ctx context.Context, st *store.Store, u store.User) (map[string]bool, []string, error) {
	ws, err := st.ListWallets(ctx, u.ID)
	if err != nil {
		return nil, nil, err
	}
	set, list := map[string]bool{}, []string{}
	for _, w := range ws {
		set[w.Address], list = true, append(list, w.Address)
	}
	return set, list, nil
}

// sendReport answers JSON (default) or, with ?format=csv, a CSV attachment with metadata lines.
func sendReport(w http.ResponseWriter, r *http.Request, deps Deps, name string, header []string, rows [][]string,
	sources []string, body map[string]any) {
	network := deps.Network.Name
	if network == "" {
		network = "devnet"
	}
	generated := time.Now().In(almaty).Format(time.RFC3339)
	if r.URL.Query().Get("format") != "csv" {
		body["network"], body["generatedAt"], body["sources"] = network, generated, sources
		writeJSON(w, http.StatusOK, body)
		return
	}
	meta := [][2]string{{"report", name}, {"network", network}, {"generated_at", generated}}
	for _, s := range sources {
		meta = append(meta, [2]string{"source", s})
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="qupon-`+name+`.csv"`)
	_ = reports.WriteCSV(w, header, rows, meta)
}

// mountReports: statements, tax certificate, holder register, payout report (platform v2 §5.4).
func mountReports(r chi.Router, deps Deps, st *store.Store) {
	need := func(w http.ResponseWriter) bool {
		if deps.Read == nil {
			writeErrorCode(w, http.StatusServiceUnavailable, "chain_unavailable", "no chain reader configured")
			return false
		}
		return true
	}

	r.With(requireUser(deps.Auth)).Get("/me/reports/statement", func(w http.ResponseWriter, r *http.Request) {
		if !need(w) {
			return
		}
		from, to := r.URL.Query().Get("from"), r.URL.Query().Get("to")
		for _, d := range []string{from, to} {
			if _, err := time.Parse("2006-01-02", d); d != "" && err != nil {
				writeErrorCode(w, http.StatusBadRequest, "invalid_params", "from/to must be YYYY-MM-DD")
				return
			}
		}
		u, _ := auth.UserFrom(r.Context())
		owners, list, err := userOwners(r.Context(), st, u)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		all, err := ownerPayouts(r.Context(), deps.Read, st, owners)
		if err != nil {
			writeErrorCode(w, http.StatusBadGateway, "chain_unavailable", err.Error())
			return
		}
		ps := []reports.Payout{}
		for _, p := range all {
			if (from == "" || p.PaymentDate >= from) && (to == "" || p.PaymentDate <= to) {
				ps = append(ps, p)
			}
		}
		h, rows := reports.PayoutTable(ps)
		sendReport(w, r, deps, "statement", h, rows, list, map[string]any{"payouts": ps, "totals": reports.Sum(ps)})
	})

	r.With(requireUser(deps.Auth)).Get("/me/reports/tax", func(w http.ResponseWriter, r *http.Request) {
		if !need(w) {
			return
		}
		year, err := strconv.Atoi(r.URL.Query().Get("year"))
		if err != nil || year < 2020 || year > 2100 {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "year must be a calendar year")
			return
		}
		u, _ := auth.UserFrom(r.Context())
		owners, list, err := userOwners(r.Context(), st, u)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		all, err := ownerPayouts(r.Context(), deps.Read, st, owners)
		if err != nil {
			writeErrorCode(w, http.StatusBadGateway, "chain_unavailable", err.Error())
			return
		}
		ps := reports.TaxYear(all, year)
		h, rows := reports.PayoutTable(ps)
		sendReport(w, r, deps, "tax-"+strconv.Itoa(year), h, rows, list,
			map[string]any{"year": year, "payouts": ps, "totals": reports.Sum(ps)})
	})

	r.With(requireRole(deps.Auth, "registrar")).Get("/registrar/reports/holders/{mint}", func(w http.ResponseWriter, r *http.Request) {
		if !need(w) {
			return
		}
		mint, ok := pathKey(w, r, "mint")
		if !ok {
			return
		}
		pda, err := deps.Read.SeriesPDA(mint)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		s, err := deps.Read.FetchSeries(r.Context(), pda)
		if err != nil || s == nil {
			writeErrorCode(w, http.StatusNotFound, "not_found", "unknown series")
			return
		}
		recs, err := deps.Read.FetchInvestorsBySeries(r.Context(), pda)
		if err != nil {
			writeErrorCode(w, http.StatusBadGateway, "chain_unavailable", err.Error())
			return
		}
		hs := make([]reports.Holding, 0, len(recs))
		for _, rec := range recs {
			inv := rec.Investor
			units := uint64(0)
			if ta, err := deps.Read.FetchTokenAccount(r.Context(), inv.BondATA); err == nil && ta != nil {
				units = ta.Amount
			}
			hs = append(hs, reports.Holding{Series: trimBytes(s.Ticker[:]), ISIN: trimBytes(s.ISIN[:]),
				Owner: inv.Owner.String(), Units: units, InvestorType: pick(investorTypeNames, inv.InvestorType),
				Residency: pick(residencyNames, inv.Residency), TaxBps: int(inv.TaxRateBps),
				Status: pick(investorStatusNames, inv.Status), KYCRef: kycRefOf(inv)})
		}
		h, rows := reports.HoldingTable(hs)
		sendReport(w, r, deps, "holders-"+trimBytes(s.Ticker[:]), h, rows, []string{mint.String(), pda.String()},
			map[string]any{"holders": hs})
	})

	r.With(requireRole(deps.Auth, "issuer", "registrar")).Get("/issuer/reports/payouts/{pda}", func(w http.ResponseWriter, r *http.Request) {
		if !need(w) {
			return
		}
		pda, ok := pathKey(w, r, "pda")
		if !ok {
			return
		}
		a, err := deps.Read.FetchCorporateAction(r.Context(), pda)
		if err != nil || a == nil {
			writeErrorCode(w, http.StatusNotFound, "not_found", "unknown action")
			return
		}
		s, err := deps.Read.FetchSeries(r.Context(), a.Series)
		if err != nil || s == nil {
			writeErrorCode(w, http.StatusNotFound, "not_found", "unknown series")
			return
		}
		m, err := cashMoney(r.Context(), deps.Read, st, a.CashMint)
		if err != nil {
			writeErrorCode(w, http.StatusBadGateway, "chain_unavailable", err.Error())
			return
		}
		ents, err := deps.Read.FetchEntitlementsByAction(r.Context(), pda)
		if err != nil {
			writeErrorCode(w, http.StatusBadGateway, "chain_unavailable", err.Error())
			return
		}
		ps := make([]reports.Payout, 0, len(ents))
		for _, er := range ents {
			ps = append(ps, payoutRow(s, pda, a, er.Entitlement, m))
		}
		h, rows := reports.PayoutTable(ps)
		sendReport(w, r, deps, "payouts-"+trimBytes(a.CorpID[:]), h, rows, []string{pda.String()},
			map[string]any{"payouts": ps, "totals": reports.Sum(ps)})
	})
}
