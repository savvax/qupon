package api

// Public holder lookup (plan 15, task 1525): GET /holders/{owner} answers "where do my bonds and
// payouts stand?" for any wallet — positions per series with KYC and payout route, every entitlement
// with the tx that paid it, and the next record/payment dates per series through the series clock
// (real Almaty midnights or the demo clock, plan 15 D7).

import (
	"context"
	"encoding/hex"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/entitlement"
	"github.com/qupon-kz/qupon/services/registrar/internal/network"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

var payoutRouteNames = []string{"wallet", "bank"}

// HolderKycDTO is openapi.yaml#/components/schemas/HolderKycDTO.
type HolderKycDTO struct {
	Attested bool   `json:"attested"` // SAS attestation PDA recorded (SIMULATED vendor)
	Ref      string `json:"ref"`      // "" when registered before KYC was enforced
}

// PayoutRouteDTO is openapi.yaml#/components/schemas/PayoutRouteDTO.
type PayoutRouteDTO struct {
	Route       string  `json:"route"` // wallet | bank
	BankRefHash *string `json:"bankRefHash"`
	UpdatedAt   *string `json:"updatedAt"`
}

// HolderPositionDTO is openapi.yaml#/components/schemas/HolderPositionDTO.
type HolderPositionDTO struct {
	Series      string          `json:"series"`
	Mint        string          `json:"mint"`
	Ticker      string          `json:"ticker"`
	ISIN        string          `json:"isin"`
	BondATA     string          `json:"bondAta"`
	CashATA     string          `json:"cashAta"`
	Units       string          `json:"units"`
	Status      string          `json:"status"`
	KYC         HolderKycDTO    `json:"kyc"`
	PayoutRoute *PayoutRouteDTO `json:"payoutRoute"` // nil = no PayoutRoute account; payouts go to cashAta
	ExplorerURL string          `json:"explorerUrl"`
}

// HolderEntitlementDTO is openapi.yaml#/components/schemas/HolderEntitlementDTO: EntitlementDTO plus
// the action kind and the transaction that moved the payout (null before the poller ingests it).
type HolderEntitlementDTO struct {
	EntitlementDTO
	Kind      string  `json:"kind"`
	PaidTx    *string `json:"paidTx"`
	PaidTxURL *string `json:"paidTxUrl"`
}

// UpcomingPayoutDTO is openapi.yaml#/components/schemas/UpcomingPayoutDTO.
type UpcomingPayoutDTO struct {
	Mint      string  `json:"mint"`
	Ticker    string  `json:"ticker"`
	Kind      string  `json:"kind"` // action kind, or "INTR (projected)" for an unannounced coupon
	ActionPDA *string `json:"actionPda"`
	RecordAt  string  `json:"recordAt"`
	PaymentAt string  `json:"paymentAt"`
}

// HolderLookupDTO is openapi.yaml#/components/schemas/HolderLookupDTO.
type HolderLookupDTO struct {
	Owner           string                 `json:"owner"`
	Positions       []HolderPositionDTO    `json:"positions"`
	Entitlements    []HolderEntitlementDTO `json:"entitlements"`
	UpcomingPayouts []UpcomingPayoutDTO    `json:"upcomingPayouts"`
}

// seriesClock mirrors the on-chain SeriesClock (plan 15 D7): the real Almaty clock, or the series'
// demo clock anchored at its issue date.
func seriesClock(s *chain.Series) (entitlement.CivilClock, error) {
	if s.DaySecs == 0 {
		return entitlement.CivilClockReal(5 * 3600), nil
	}
	issue, err := entitlement.YMDFromPacked(s.IssueYmd)
	if err != nil {
		return entitlement.CivilClock{}, err
	}
	return entitlement.CivilClockDemo(s.DaySecs, s.IssueDate, issue)
}

func payoutRouteDTO(p *chain.PayoutRoute) *PayoutRouteDTO {
	dto := &PayoutRouteDTO{Route: pick(payoutRouteNames, p.Route), UpdatedAt: optDateTime(p.UpdatedAt)}
	if p.BankRefHash != [32]byte{} {
		h := hex.EncodeToString(p.BankRefHash[:])
		dto.BankRefHash = &h
	}
	return dto
}

// mountHolders registers the public holder lookup; a nil ReadModel answers 503.
func mountHolders(r chi.Router, rm ReadModel, st *store.Store) {
	r.Get("/holders/{owner}", func(w http.ResponseWriter, r *http.Request) {
		if rm == nil {
			writeError(w, http.StatusServiceUnavailable, "chain reader not configured (set PROGRAM_ID)")
			return
		}
		owner, ok := pathKey(w, r, "owner")
		if !ok {
			return
		}
		// One owner can touch many series and actions; devnet latency dominates.
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		fail := func(err error) { writeError(w, http.StatusBadGateway, err.Error()) }

		// Positions: the owner's Investor accounts, with live units and the payout route each chose.
		investors, err := rm.FetchInvestorsByOwner(ctx, owner)
		if err != nil {
			fail(err)
			return
		}
		out := HolderLookupDTO{
			Owner:           owner.String(),
			Positions:       make([]HolderPositionDTO, 0, len(investors)),
			Entitlements:    []HolderEntitlementDTO{},
			UpcomingPayouts: []UpcomingPayoutDTO{},
		}
		now := time.Now().Unix()
		for _, rec := range investors {
			inv := rec.Investor
			s, err := rm.FetchSeries(ctx, inv.Series)
			if err != nil {
				fail(err)
				return
			}
			units := uint64(0)
			if ta, err := rm.FetchTokenAccount(ctx, inv.BondATA); err == nil && ta != nil {
				units = ta.Amount
			}
			pos := HolderPositionDTO{
				Series: inv.Series.String(), Mint: s.Mint.String(), Ticker: trimBytes(s.Ticker[:]),
				ISIN: trimBytes(s.ISIN[:]), BondATA: inv.BondATA.String(), CashATA: inv.CashATA.String(),
				Units: strconv.FormatUint(units, 10), Status: pick(investorStatusNames, inv.Status),
				KYC:         HolderKycDTO{Attested: kycRefOf(inv) != "", Ref: kycRefOf(inv)},
				ExplorerURL: explorer(inv.BondATA),
			}
			if route, err := rm.FetchPayoutRoute(ctx, rec.PDA); err != nil {
				fail(err)
				return
			} else if route != nil {
				pos.PayoutRoute = payoutRouteDTO(route)
			}
			out.Positions = append(out.Positions, pos)

			// Next payout of this series: the open action when one runs, else the projected coupon
			// (record = period end, payment = +2 civil days) through the series clock.
			var open *chain.CorporateAction
			if s.OpenAction != nil {
				if a, err := rm.FetchCorporateAction(ctx, *s.OpenAction); err != nil {
					fail(err)
					return
				} else {
					open = a
				}
			}
			switch {
			case open != nil && open.Status != 5 && open.Status != 7: // not Completed/Cancelled
				pda := s.OpenAction.String()
				out.UpcomingPayouts = append(out.UpcomingPayouts, UpcomingPayoutDTO{
					Mint: s.Mint.String(), Ticker: pos.Ticker, Kind: pick(kindNames, open.Kind),
					ActionPDA: &pda, RecordAt: dateTime(open.RecordAt), PaymentAt: dateTime(open.PaymentAt),
				})
			case open == nil && s.Status == 0 && s.NextCouponDate > now:
				payment, err := paymentAfter(s, s.NextCouponDate)
				if err != nil {
					fail(err)
					return
				}
				out.UpcomingPayouts = append(out.UpcomingPayouts, UpcomingPayoutDTO{
					Mint: s.Mint.String(), Ticker: pos.Ticker, Kind: "INTR (projected)",
					RecordAt: dateTime(s.NextCouponDate), PaymentAt: dateTime(payment),
				})
			}
		}

		// Entitlements with the paying tx: the feed row whose payload names this owner.
		entRecs, err := rm.FetchEntitlementsByOwner(ctx, owner)
		if err != nil {
			fail(err)
			return
		}
		actions := make([]string, 0, len(entRecs))
		for _, rec := range entRecs {
			actions = append(actions, rec.Entitlement.Action.String())
		}
		paidTx, err := st.HolderPaidTx(ctx, owner.String(), actions)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		for _, rec := range entRecs {
			e := rec.Entitlement
			a, err := rm.FetchCorporateAction(ctx, e.Action)
			if err != nil {
				fail(err)
				return
			}
			if a == nil {
				continue
			}
			m, err := cashMoney(ctx, rm, st, a.CashMint)
			if err != nil {
				fail(err)
				return
			}
			dto := HolderEntitlementDTO{
				EntitlementDTO: EntitlementDTO{
					PDA: rec.PDA.String(), ActionPDA: e.Action.String(), Owner: e.Owner.String(),
					Units: strconv.FormatUint(e.Units, 10), Gross: m.amount(e.Gross), Tax: m.amount(e.Tax),
					Net: m.amount(e.Net), Principal: m.amount(e.Principal), Status: pick(entitlementStatusNames, e.Status),
					PaidAt: optDateTime(e.PaidAt), Vote: pick(voteNames, e.Vote), VotedAt: optDateTime(e.VotedAt),
					ExplorerURL: explorer(rec.PDA),
				},
				Kind: pick(kindNames, a.Kind),
			}
			if sig, ok := paidTx[e.Action.String()]; ok {
				url := network.ExplorerURL("tx", sig)
				dto.PaidTx, dto.PaidTxURL = &sig, &url
			}
			out.Entitlements = append(out.Entitlements, dto)
		}
		writeJSON(w, http.StatusOK, out)
	})
}

// paymentAfter returns the payment timestamp of a coupon whose record date is record: two civil days
// later on the series' clock (docs/03-domain.md §1 defaults — 2 × 86 400 s on the real clock, the
// same two civil days compressed on a demo clock).
func paymentAfter(s *chain.Series, record int64) (int64, error) {
	clk, err := seriesClock(s)
	if err != nil {
		return 0, err
	}
	d, err := clk.FloorCivil(record)
	if err != nil {
		return 0, err
	}
	pay, err := entitlement.YMDFromDays(d.DaysFromEpoch() + 2)
	if err != nil {
		return 0, err
	}
	return clk.Ts(pay)
}
