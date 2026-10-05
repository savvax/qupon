package api

// Read models for the web app (docs/02-architecture.md REST, openapi.yaml): every amount as
// {minor, display, currency}, dates in Asia/Almaty (+05:00), explorer links precomputed.

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/entitlement"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// ReadModel is what the read endpoints need from the chain; *chain.Client satisfies it, tests use a fake.
type ReadModel interface {
	AllSeries(ctx context.Context) ([]chain.SeriesRecord, error)
	SeriesPDA(mint solana.PublicKey) (solana.PublicKey, error)
	FetchSeries(ctx context.Context, pda solana.PublicKey) (*chain.Series, error)
	FetchCorporateAction(ctx context.Context, pda solana.PublicKey) (*chain.CorporateAction, error)
	FetchActionsBySeries(ctx context.Context, series solana.PublicKey) ([]chain.ActionRecord, error)
	FetchInvestorsBySeries(ctx context.Context, series solana.PublicKey) ([]chain.InvestorRecord, error)
	FetchEntitlementsByAction(ctx context.Context, action solana.PublicKey) ([]chain.EntitlementRecord, error)
	FetchTokenAccount(ctx context.Context, addr solana.PublicKey) (*chain.TokenAccount, error)
	FetchMint(ctx context.Context, mint solana.PublicKey) (*chain.Mint, error)
}

var almaty = time.FixedZone("Asia/Almaty", 5*3600)

// Amount is a money value in minor units with a display string.
type Amount struct {
	Minor    string `json:"minor"`
	Display  string `json:"display"`
	Currency string `json:"currency"`
}

type money struct {
	decimals uint8
	currency string
}

func (m money) amount(v uint64) Amount {
	minor := strconv.FormatUint(v, 10)
	display := minor
	if m.decimals > 0 {
		padded := fmt.Sprintf("%0*s", int(m.decimals)+1, minor)
		cut := len(padded) - int(m.decimals)
		display = padded[:cut] + "." + padded[cut:]
	}
	return Amount{Minor: minor, Display: display + " " + m.currency, Currency: m.currency}
}

func cashMoney(ctx context.Context, rm ReadModel, cashMint solana.PublicKey) (money, error) {
	cur := chain.CashCurrency(cashMint)
	m, err := rm.FetchMint(ctx, cashMint)
	if err != nil {
		return money{}, fmt.Errorf("cash mint %s: %w", cashMint, err)
	}
	if m == nil {
		return money{}, fmt.Errorf("cash mint %s not found", cashMint)
	}
	return money{decimals: m.Decimals, currency: cur}, nil
}

func explorer(addr solana.PublicKey) string {
	return "https://explorer.solana.com/address/" + addr.String() + "?cluster=devnet"
}

func dateTime(ts int64) string { return time.Unix(ts, 0).In(almaty).Format(time.RFC3339) }

// civil is the Almaty calendar date of a timestamp (period boundaries are Almaty midnights).
func civil(ts int64) string { return time.Unix(ts, 0).In(almaty).Format(time.DateOnly) }

func optDateTime(ts int64) *string {
	if ts == 0 {
		return nil
	}
	s := dateTime(ts)
	return &s
}

func trimBytes(b []byte) string { return strings.TrimRight(string(b), "\x00") }

// kycRefOf is the SAS attestation PDA in base58, or "" when the investor
// record carries no attestation (registered before KYC was enforced).
func kycRefOf(inv *chain.Investor) string {
	for _, b := range inv.KYCRef {
		if b != 0 {
			return solana.PublicKeyFromBytes(inv.KYCRef[:]).String()
		}
	}
	return ""
}

func pick(names []string, i uint8) string {
	if int(i) < len(names) {
		return names[i]
	}
	return "Unknown"
}

var (
	seriesStatusNames = []string{"Active", "Matured", "Retiring", "Closed"}
	dayCountNames     = []string{"THIRTY_360", "ACT_ACT", "ACT_365"}
	kindNames         = []string{"INTR", "REDM", "MCAL", "PCAL", "BMET", "CHAN"}
	mandatoryNames    = []string{"MAND", "VOLU", "CHOS"}
	actionStatusNames = []string{"Announced", "RecordStruck", "SnapshotComplete", "Funded", "Settling",
		"Completed", "Retiring", "Cancelled", "VotingOpen", "Finalized"}
	resultNames            = []string{"Pending", "Approved", "Rejected", "NoQuorum"}
	entitlementStatusNames = []string{"Snapshotted", "Paid", "Retired"}
	voteNames              = []string{"None", "For", "Against", "Abstain"}
	investorStatusNames    = []string{"Active", "Suspended"}
	investorTypeNames      = []string{"individual", "legal_entity"}
	residencyNames         = []string{"resident", "nonresident"}
)

// SeriesDTO is openapi.yaml#/components/schemas/SeriesDTO.
type SeriesDTO struct {
	PDA            string  `json:"pda"` // Series account; activity events name their series by it
	Mint           string  `json:"mint"`
	CashMint       string  `json:"cashMint"`
	Registrar      string  `json:"registrar"`
	Issuer         string  `json:"issuer"`
	PayingAgent    string  `json:"payingAgent"`
	ISIN           string  `json:"isin"`
	Ticker         string  `json:"ticker"`
	FaceValue      Amount  `json:"faceValue"`
	CouponRateBps  uint32  `json:"couponRateBps"`
	Frequency      uint8   `json:"frequency"`
	DayCount       string  `json:"dayCount"`
	IssueDate      string  `json:"issueDate"`
	MaturityDate   string  `json:"maturityDate"`
	NextCouponDate string  `json:"nextCouponDate"`
	Status         string  `json:"status"`
	TotalIssued    string  `json:"totalIssued"`
	QuorumBps      uint16  `json:"quorumBps"`
	ApprovalBps    uint16  `json:"approvalBps"`
	OpenAction     *string `json:"openAction"`
	ExplorerURL    string  `json:"explorerUrl"`
}

func seriesDTO(pda solana.PublicKey, s *chain.Series, m money) SeriesDTO {
	var open *string
	if s.OpenAction != nil {
		v := s.OpenAction.String()
		open = &v
	}
	return SeriesDTO{
		PDA:  pda.String(),
		Mint: s.Mint.String(), CashMint: s.CashMint.String(), Registrar: s.Registrar.String(),
		Issuer: s.Issuer.String(), PayingAgent: s.PayingAgent.String(),
		ISIN: trimBytes(s.ISIN[:]), Ticker: trimBytes(s.Ticker[:]), FaceValue: m.amount(s.FaceValue),
		CouponRateBps: s.CouponRateBps, Frequency: s.Frequency, DayCount: pick(dayCountNames, s.DayCount),
		IssueDate: civil(s.IssueDate), MaturityDate: civil(s.MaturityDate), NextCouponDate: dateTime(s.NextCouponDate),
		Status: pick(seriesStatusNames, s.Status), TotalIssued: strconv.FormatUint(s.TotalIssued, 10),
		QuorumBps: s.QuorumBps, ApprovalBps: s.ApprovalBps, OpenAction: open, ExplorerURL: explorer(s.Mint),
	}
}

// InvestorDTO is openapi.yaml#/components/schemas/InvestorDTO.
type InvestorDTO struct {
	Owner        string `json:"owner"`
	BondATA      string `json:"bondAta"`
	CashATA      string `json:"cashAta"`
	Units        string `json:"units"`
	InvestorType string `json:"investorType"`
	Residency    string `json:"residency"`
	TaxRateBps   int    `json:"taxRateBps"`
	KYCRef       string `json:"kycRef"`
	Status       string `json:"status"`
	ExplorerURL  string `json:"explorerUrl"`
}

// ActionDTO is openapi.yaml#/components/schemas/ActionDTO.
type ActionDTO struct {
	PDA                 string  `json:"pda"`
	SeriesMint          string  `json:"seriesMint"`
	Kind                string  `json:"kind"`
	Mandatory           string  `json:"mandatory"`
	CorpID              string  `json:"corpId"`
	OfficialID          *string `json:"officialId"`
	AnnouncedAt         string  `json:"announcedAt"`
	RecordAt            string  `json:"recordAt"`
	PaymentAt           string  `json:"paymentAt"`
	PeriodStart         *string `json:"periodStart"`
	PeriodEnd           *string `json:"periodEnd"`
	AccrualDays         *uint32 `json:"accrualDays"`
	RateBps             *uint32 `json:"rateBps"`
	PerUnitGross        Amount  `json:"perUnitGross"`
	PerUnitPrincipal    Amount  `json:"perUnitPrincipal"`
	CashMint            string  `json:"cashMint"`
	Escrow              string  `json:"escrow"`
	EscrowBalance       Amount  `json:"escrowBalance"`
	Status              string  `json:"status"`
	SnapshotSlot        *uint64 `json:"snapshotSlot"`
	SnapshotHash        *string `json:"snapshotHash"`
	UnitsSnapshotted    string  `json:"unitsSnapshotted"`
	HoldersSnapshotted  uint32  `json:"holdersSnapshotted"`
	HoldersPaid         uint32  `json:"holdersPaid"`
	TotalGross          Amount  `json:"totalGross"`
	TotalTax            Amount  `json:"totalTax"`
	TotalNet            Amount  `json:"totalNet"`
	TotalPaid           Amount  `json:"totalPaid"`
	TotalRetired        string  `json:"totalRetired"`
	HoldersRetired      uint32  `json:"holdersRetired"`
	ProposalNewRateBps  *uint32 `json:"proposalNewRateBps"`
	ProposalNewMaturity *string `json:"proposalNewMaturity"`
	VotingEndsAt        *string `json:"votingEndsAt"`
	VotesFor            string  `json:"votesFor"`
	VotesAgainst        string  `json:"votesAgainst"`
	VotesAbstain        string  `json:"votesAbstain"`
	Result              *string `json:"result"`
	CompletedAt         *string `json:"completedAt"`
	FactorBps           *uint16 `json:"factorBps"`
	ExplorerURL         string  `json:"explorerUrl"`
}

func actionDTO(pda solana.PublicKey, a *chain.CorporateAction, seriesMint solana.PublicKey, m money) ActionDTO {
	u := func(v uint64) string { return strconv.FormatUint(v, 10) }
	d := ActionDTO{
		PDA: pda.String(), SeriesMint: seriesMint.String(), Kind: pick(kindNames, a.Kind),
		Mandatory: pick(mandatoryNames, a.Mandatory), CorpID: trimBytes(a.CorpID[:]),
		AnnouncedAt: dateTime(a.AnnouncedAt), RecordAt: dateTime(a.RecordAt), PaymentAt: dateTime(a.PaymentAt),
		PerUnitGross: m.amount(a.PerUnitGross), PerUnitPrincipal: m.amount(a.PerUnitPrincipal),
		CashMint: a.CashMint.String(), Escrow: a.Escrow.String(), Status: pick(actionStatusNames, a.Status),
		UnitsSnapshotted: u(a.UnitsSnapshotted), HoldersSnapshotted: a.HoldersSnapshotted, HoldersPaid: a.HoldersPaid,
		TotalGross: m.amount(a.TotalGross), TotalTax: m.amount(a.TotalTax), TotalNet: m.amount(a.TotalNet),
		TotalPaid: m.amount(a.TotalPaid), TotalRetired: u(a.TotalRetired), HoldersRetired: a.HoldersRetired,
		VotesFor: u(a.VotesFor), VotesAgainst: u(a.VotesAgainst), VotesAbstain: u(a.VotesAbstain),
		CompletedAt: optDateTime(a.CompletedAt), VotingEndsAt: optDateTime(a.VotingEndsAt),
		ExplorerURL: explorer(pda),
	}
	if id := trimBytes(a.OfficialID[:]); id != "" {
		d.OfficialID = &id
	}
	if a.PeriodEnd != 0 { // cash kinds; BMET has no period
		ps, pe := civil(a.PeriodStart), civil(a.PeriodEnd)
		d.PeriodStart, d.PeriodEnd, d.AccrualDays, d.RateBps = &ps, &pe, &a.AccrualDays, &a.RateBps
	}
	if a.SnapshotSlot != 0 {
		slot, h := a.SnapshotSlot, hex.EncodeToString(a.SnapshotHash[:])
		d.SnapshotSlot, d.SnapshotHash = &slot, &h
	}
	if a.Kind == 4 { // BMET
		res := pick(resultNames, a.Result)
		d.Result, d.ProposalNewRateBps = &res, &a.ProposalNewRateBps
		if a.ProposalNewMaturity != 0 {
			pm := civil(a.ProposalNewMaturity)
			d.ProposalNewMaturity = &pm
		}
	}
	if a.Kind == 3 { // PCAL
		d.FactorBps = &a.FactorBps
	}
	return d
}

// EntitlementDTO is openapi.yaml#/components/schemas/EntitlementDTO.
type EntitlementDTO struct {
	PDA         string  `json:"pda"`
	ActionPDA   string  `json:"actionPda"`
	Owner       string  `json:"owner"`
	Units       string  `json:"units"`
	Gross       Amount  `json:"gross"`
	Tax         Amount  `json:"tax"`
	Net         Amount  `json:"net"`
	Principal   Amount  `json:"principal"`
	Status      string  `json:"status"`
	PaidAt      *string `json:"paidAt"`
	Vote        string  `json:"vote"`
	VotedAt     *string `json:"votedAt"`
	ExplorerURL string  `json:"explorerUrl"`
}

// ScheduleItem is openapi.yaml#/components/schemas/ScheduleItem.
type ScheduleItem struct {
	CouponNumber  int     `json:"couponNumber"`
	PeriodStart   string  `json:"periodStart"`
	PeriodEnd     string  `json:"periodEnd"`
	RecordDate    string  `json:"recordDate"`
	PaymentDate   string  `json:"paymentDate"`
	AmountPerUnit Amount  `json:"amountPerUnit"`
	TotalAmount   Amount  `json:"totalAmount"`
	ActionPDA     *string `json:"actionPda"`
	Status        string  `json:"status"`
}

// schedule projects every coupon from issue to maturity. Record date = the period-end date at 00:00 Almaty (03-domain §1), payment = period end + 2 days (03-domain §1 defaults); coupon k is computed from the issue date. The
// last item includes principal. Announced actions are matched by period end.
func schedule(s *chain.Series, actions []chain.ActionRecord, m money) ([]ScheduleItem, error) {
	dc, err := entitlement.DayCountFromCode(s.DayCount)
	if err != nil {
		return nil, err
	}
	months := uint32(12 / max(s.Frequency, 1))
	issue, err := entitlement.YMDFromUnixUTC(s.IssueDate + 5*3600)
	if err != nil {
		return nil, err
	}
	toTS := func(d entitlement.YMD) int64 { return d.DaysFromEpoch()*86400 - 5*3600 }
	var out []ScheduleItem
	prev := issue
	for k := uint32(1); ; k++ {
		end, err := issue.AddMonths(k * months)
		if err != nil {
			return nil, err
		}
		endTS := toTS(end)
		if endTS > s.MaturityDate {
			break
		}
		days, err := entitlement.AccrualDays(dc, prev, end)
		if err != nil {
			return nil, err
		}
		perUnit, err := entitlement.PerUnitGross(s.FaceValue, s.CouponRateBps, dc, days)
		if err != nil {
			return nil, err
		}
		if endTS == s.MaturityDate {
			perUnit += s.FaceValue
		}
		item := ScheduleItem{
			CouponNumber: int(k), PeriodStart: civil(toTS(prev)), PeriodEnd: civil(endTS),
			RecordDate: dateTime(endTS), PaymentDate: dateTime(endTS + 2*86400),
			AmountPerUnit: m.amount(perUnit), TotalAmount: m.amount(perUnit * s.TotalIssued), Status: "Projected",
		}
		if endTS <= s.PeriodStart {
			item.Status = "Completed"
		}
		for _, a := range actions {
			if a.Action.PeriodEnd != endTS || a.Action.Status == 7 { // Cancelled actions do not count
				continue
			}
			pda := a.PDA.String()
			item.ActionPDA = &pda
			switch a.Action.Status {
			case 0:
				item.Status = "Announced"
			case 5:
				item.Status = "Completed"
			default:
				item.Status = "InProgress"
			}
		}
		out = append(out, item)
		prev = end
		if endTS == s.MaturityDate {
			break
		}
	}
	return out, nil
}

func pathKey(w http.ResponseWriter, r *http.Request, name string) (solana.PublicKey, bool) {
	k, err := solana.PublicKeyFromBase58(chi.URLParam(r, name))
	if err != nil {
		writeError(w, http.StatusBadRequest, name+" must be a base58 pubkey")
		return k, false
	}
	return k, true
}

// mountReadModels registers the read endpoints; with a nil ReadModel they answer 503.
func mountReadModels(r chi.Router, rm ReadModel, st *store.Store) {
	need := func(h func(http.ResponseWriter, *http.Request)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if rm == nil {
				writeError(w, http.StatusServiceUnavailable, "chain reader not configured (set PROGRAM_ID)")
				return
			}
			h(w, r)
		}
	}
	fail := func(w http.ResponseWriter, err error) { writeError(w, http.StatusBadGateway, err.Error()) }

	// loadSeries resolves {mint} → Series + money; writes the error response itself.
	loadSeries := func(w http.ResponseWriter, r *http.Request) (solana.PublicKey, *chain.Series, money, bool) {
		mint, ok := pathKey(w, r, "mint")
		if !ok {
			return mint, nil, money{}, false
		}
		pda, err := rm.SeriesPDA(mint)
		if err != nil {
			fail(w, err)
			return pda, nil, money{}, false
		}
		s, err := rm.FetchSeries(r.Context(), pda)
		if err != nil {
			fail(w, err)
			return pda, nil, money{}, false
		}
		if s == nil {
			writeError(w, http.StatusNotFound, "no series for mint "+mint.String())
			return pda, nil, money{}, false
		}
		m, err := cashMoney(r.Context(), rm, s.CashMint)
		if err != nil {
			fail(w, err)
			return pda, nil, money{}, false
		}
		return pda, s, m, true
	}

	r.Get("/series", func(w http.ResponseWriter, r *http.Request) {
		if rm == nil { // no chain reader: serve the mirror indexed at startup
			rows, err := st.ListSeries(r.Context())
			if err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			out := make([]json.RawMessage, 0, len(rows))
			for _, row := range rows {
				out = append(out, row.Data)
			}
			writeJSON(w, http.StatusOK, out)
			return
		}
		recs, err := rm.AllSeries(r.Context())
		if err != nil {
			fail(w, err)
			return
		}
		out := make([]SeriesDTO, 0, len(recs))
		for _, rec := range recs {
			m, err := cashMoney(r.Context(), rm, rec.Series.CashMint)
			if err != nil {
				fail(w, err)
				return
			}
			out = append(out, seriesDTO(rec.PDA, rec.Series, m))
		}
		writeJSON(w, http.StatusOK, out)
	})

	r.Get("/series/{mint}", need(func(w http.ResponseWriter, r *http.Request) {
		if pda, s, m, ok := loadSeries(w, r); ok {
			writeJSON(w, http.StatusOK, seriesDTO(pda, s, m))
		}
	}))

	r.Get("/series/{mint}/investors", need(func(w http.ResponseWriter, r *http.Request) {
		pda, _, _, ok := loadSeries(w, r)
		if !ok {
			return
		}
		recs, err := rm.FetchInvestorsBySeries(r.Context(), pda)
		if err != nil {
			fail(w, err)
			return
		}
		out := make([]InvestorDTO, 0, len(recs))
		for _, rec := range recs {
			inv := rec.Investor
			units := uint64(0)
			if ta, err := rm.FetchTokenAccount(r.Context(), inv.BondATA); err == nil && ta != nil {
				units = ta.Amount
			}
			out = append(out, InvestorDTO{
				Owner: inv.Owner.String(), BondATA: inv.BondATA.String(), CashATA: inv.CashATA.String(),
				Units: strconv.FormatUint(units, 10), Status: pick(investorStatusNames, inv.Status),
				InvestorType: pick(investorTypeNames, inv.InvestorType), Residency: pick(residencyNames, inv.Residency),
				TaxRateBps: int(inv.TaxRateBps), KYCRef: kycRefOf(inv),
				ExplorerURL: explorer(inv.Owner),
			})
		}
		writeJSON(w, http.StatusOK, out)
	}))

	// GET /schedule: every series' projected coupon calendar (task 024 — the
	// autopilot's plan view). Reuses the per-series projection verbatim.
	r.Get("/schedule", need(func(w http.ResponseWriter, r *http.Request) {
		recs, err := rm.AllSeries(r.Context())
		if err != nil {
			fail(w, err)
			return
		}
		type seriesSchedule struct {
			Mint           string         `json:"mint"`
			Ticker         string         `json:"ticker"`
			Status         string         `json:"status"`
			NextCouponDate string         `json:"nextCouponDate"`
			Items          []ScheduleItem `json:"items"`
		}
		out := make([]seriesSchedule, 0, len(recs))
		for _, rec := range recs {
			m, err := cashMoney(r.Context(), rm, rec.Series.CashMint)
			if err != nil {
				fail(w, err)
				return
			}
			actions, err := rm.FetchActionsBySeries(r.Context(), rec.PDA)
			if err != nil {
				fail(w, err)
				return
			}
			items, err := schedule(rec.Series, actions, m)
			if err != nil {
				fail(w, err)
				return
			}
			out = append(out, seriesSchedule{
				Mint: rec.Series.Mint.String(), Ticker: trimBytes(rec.Series.Ticker[:]),
				Status: pick(seriesStatusNames, rec.Series.Status), NextCouponDate: dateTime(rec.Series.NextCouponDate),
				Items: items,
			})
		}
		writeJSON(w, http.StatusOK, map[string]any{"series": out})
	}))

	r.Get("/series/{mint}/schedule", need(func(w http.ResponseWriter, r *http.Request) {
		pda, s, m, ok := loadSeries(w, r)
		if !ok {
			return
		}
		actions, err := rm.FetchActionsBySeries(r.Context(), pda)
		if err != nil {
			fail(w, err)
			return
		}
		items, err := schedule(s, actions, m)
		if err != nil {
			fail(w, err)
			return
		}
		writeJSON(w, http.StatusOK, items)
	}))

	r.Get("/series/{mint}/actions", need(func(w http.ResponseWriter, r *http.Request) {
		pda, s, m, ok := loadSeries(w, r)
		if !ok {
			return
		}
		recs, err := rm.FetchActionsBySeries(r.Context(), pda)
		if err != nil {
			fail(w, err)
			return
		}
		out := make([]ActionDTO, 0, len(recs))
		for _, rec := range recs {
			out = append(out, actionDTO(rec.PDA, rec.Action, s.Mint, m))
		}
		writeJSON(w, http.StatusOK, out)
	}))

	// loadAction resolves {pda} → action, its series and money.
	loadAction := func(w http.ResponseWriter, r *http.Request) (solana.PublicKey, *chain.CorporateAction, *chain.Series, money, bool) {
		pda, ok := pathKey(w, r, "pda")
		if !ok {
			return pda, nil, nil, money{}, false
		}
		a, err := rm.FetchCorporateAction(r.Context(), pda)
		if err != nil {
			fail(w, err)
			return pda, nil, nil, money{}, false
		}
		if a == nil {
			writeError(w, http.StatusNotFound, "no corporate action at "+pda.String())
			return pda, nil, nil, money{}, false
		}
		s, err := rm.FetchSeries(r.Context(), a.Series)
		if err != nil || s == nil {
			fail(w, fmt.Errorf("series %s of action %s: %w", a.Series, pda, err))
			return pda, nil, nil, money{}, false
		}
		m, err := cashMoney(r.Context(), rm, a.CashMint)
		if err != nil {
			fail(w, err)
			return pda, nil, nil, money{}, false
		}
		return pda, a, s, m, true
	}

	r.Get("/actions/{pda}", need(func(w http.ResponseWriter, r *http.Request) {
		if pda, a, s, m, ok := loadAction(w, r); ok {
			dto := actionDTO(pda, a, s.Mint, m)
			// Funding panel evidence: the live escrow balance (0 when the
			// token account does not exist yet — announce init_if_needed's it).
			if ta, err := rm.FetchTokenAccount(r.Context(), a.Escrow); err == nil && ta != nil {
				dto.EscrowBalance = m.amount(ta.Amount)
			}
			writeJSON(w, http.StatusOK, dto)
		}
	}))

	// Entitlements, owner-ascending; pagination with ?offset=&limit= (default 100, max 500).
	r.Get("/actions/{pda}/entitlements", need(func(w http.ResponseWriter, r *http.Request) {
		offset, limit := 0, 100
		if v := r.URL.Query().Get("offset"); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 0 {
				writeError(w, http.StatusBadRequest, "offset must be ≥ 0")
				return
			}
			offset = n
		}
		if v := r.URL.Query().Get("limit"); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 1 || n > 500 {
				writeError(w, http.StatusBadRequest, "limit must be 1..500")
				return
			}
			limit = n
		}
		pda, _, _, m, ok := loadAction(w, r)
		if !ok {
			return
		}
		recs, err := rm.FetchEntitlementsByAction(r.Context(), pda)
		if err != nil {
			fail(w, err)
			return
		}
		recs = recs[min(offset, len(recs)):min(offset+limit, len(recs))]
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
		writeJSON(w, http.StatusOK, out)
	}))
}
