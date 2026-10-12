package api

// Read models for the web app (docs/02-architecture.md REST, openapi.yaml): every amount as
// {minor, display, currency}, dates in Asia/Almaty (+05:00), explorer links precomputed.

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/qupon-kz/qupon/services/registrar/internal/network"
	"net/http"
	"slices"
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
	// Secondary trades (trades.go): the admissions of a series, and an account with its owning program
	// (the cash mint's token program decides where the cash escrow lives).
	FetchTradeAdmissionsBySeries(ctx context.Context, series solana.PublicKey) ([]chain.TradeRecord, error)
	// Holder-chosen payout routes (plan 15 D6, payout.go): bank-routed payouts awaiting the paying agent.
	FetchPayoutRoutesBySeries(ctx context.Context, series solana.PublicKey) ([]chain.PayoutRouteRecord, error)
	GetAccountWithOwner(ctx context.Context, key solana.PublicKey) (*chain.AccountData, error)
	// Public holder lookup (holders.go, task 1525): an owner's registrations, entitlements and payout routes.
	FetchInvestorsByOwner(ctx context.Context, owner solana.PublicKey) ([]chain.InvestorRecord, error)
	FetchEntitlementsByOwner(ctx context.Context, owner solana.PublicKey) ([]chain.EntitlementRecord, error)
	FetchPayoutRoute(ctx context.Context, investor solana.PublicKey) (*chain.PayoutRoute, error)
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

// cashMoney labels amounts with the cash asset's registry symbol (KZTE, dKZT, …), else the built-in tKZT/USDC.
func cashMoney(ctx context.Context, rm ReadModel, st *store.Store, cashMint solana.PublicKey) (money, error) {
	cur := chain.CashCurrency(cashMint)
	if sym, ok := st.CashAssetSymbol(ctx, cashMint.String()); ok {
		cur = sym
	}
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
	return network.ExplorerURL("address", addr.String())
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
		"Completed", "Retiring", "Cancelled", "VotingOpen", "Finalized", "Defaulted"}
	resultNames            = []string{"Pending", "Approved", "Rejected", "NoQuorum"}
	entitlementStatusNames = []string{"Snapshotted", "Paid", "Retired", "PaidToAgent"}
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
	OpenTrades     uint32  `json:"openTrades"` // admitted secondary trades not yet released; > 0 blocks the record date
	// Plan 15: the record date is the transfer-hook gate (D1'); default state (D4); demo clock (D7, nil = real clock).
	HookGate      bool          `json:"hookGate"`
	InDefault     bool          `json:"inDefault"`
	DefaultsCount uint16        `json:"defaultsCount"`
	DemoClock     *DemoClockDTO `json:"demoClock"`
	Featured      bool          `json:"featured"` // admin-curated (platform v2 §5.2); featured series list first
	ExplorerURL   string        `json:"explorerUrl"`
}

// DemoClockDTO is openapi.yaml#/components/schemas/DemoClockDTO: one civil day lasts DaySecs seconds from IssueTs,
// whose civil date is IssueDate (plan 15 D7; label the series DEMO).
type DemoClockDTO struct {
	DaySecs   uint32 `json:"daySecs"`
	IssueTs   int64  `json:"issueTs"`
	IssueDate string `json:"issueDate"`
}

func seriesDTO(pda solana.PublicKey, s *chain.Series, m money, featured bool) SeriesDTO {
	var open *string
	if s.OpenAction != nil {
		v := s.OpenAction.String()
		open = &v
	}
	var demo *DemoClockDTO
	if s.DaySecs > 0 {
		y, mo, d := s.IssueYmd/10_000, s.IssueYmd/100%100, s.IssueYmd%100
		demo = &DemoClockDTO{DaySecs: s.DaySecs, IssueTs: s.IssueDate, IssueDate: fmt.Sprintf("%04d-%02d-%02d", y, mo, d)}
	}
	return SeriesDTO{
		HookGate: s.Hook == 1, InDefault: s.InDefault == 1, DefaultsCount: s.DefaultsCount, DemoClock: demo, Featured: featured,
		PDA:  pda.String(),
		Mint: s.Mint.String(), CashMint: s.CashMint.String(), Registrar: s.Registrar.String(),
		Issuer: s.Issuer.String(), PayingAgent: s.PayingAgent.String(),
		ISIN: trimBytes(s.ISIN[:]), Ticker: trimBytes(s.Ticker[:]), FaceValue: m.amount(s.FaceValue),
		CouponRateBps: s.CouponRateBps, Frequency: s.Frequency, DayCount: pick(dayCountNames, s.DayCount),
		IssueDate: civil(s.IssueDate), MaturityDate: civil(s.MaturityDate), NextCouponDate: dateTime(s.NextCouponDate),
		Status: pick(seriesStatusNames, s.Status), TotalIssued: strconv.FormatUint(s.TotalIssued, 10),
		QuorumBps: s.QuorumBps, ApprovalBps: s.ApprovalBps, OpenAction: open, OpenTrades: s.OpenTrades, ExplorerURL: explorer(s.Mint),
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
	// Plan 15: default/cure (D4), bank-routed payouts awaiting confirmation (D6), anchored notice hash (D9), and when
	// the snapshot was finalized (funding opens; a default is due one series day after max(payment, finalize)).
	DefaultedAt    *string `json:"defaultedAt"`
	CuredAt        *string `json:"curedAt"`
	BankPending    uint32  `json:"bankPending"`
	DisclosureHash *string `json:"disclosureHash"`
	FinalizedAt    *string `json:"finalizedAt"`
	ExplorerURL    string  `json:"explorerUrl"`
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
		DefaultedAt: optDateTime(a.DefaultedAt), CuredAt: optDateTime(a.CuredAt), BankPending: a.BankPending,
		ExplorerURL: explorer(pda),
	}
	if a.DisclosureHash != [32]byte{} {
		h := hex.EncodeToString(a.DisclosureHash[:])
		d.DisclosureHash = &h
	}
	if a.FinalizeDelay > 0 {
		d.FinalizedAt = optDateTime(a.RecordAt + int64(a.FinalizeDelay))
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
	// Demo clock (plan 15 D7): a civil date's timestamp is issue + demo-days × day_secs. The real Almaty
	// midnight of a coupon date lies far beyond a compressed maturity, so the loop broke at once and
	// every sandbox view carried schedule:null — the page maps over it and crashed (task 91556).
	toTS := func(d entitlement.YMD) int64 { return d.DaysFromEpoch()*86400 - 5*3600 }
	label := func(d entitlement.YMD) string { return civil(toTS(d)) }
	daySecs := int64(86_400)
	if s.DaySecs > 0 {
		daySecs = int64(s.DaySecs)
		issueDays := issue.DaysFromEpoch()
		toTS = func(d entitlement.YMD) int64 { return s.IssueDate + (d.DaysFromEpoch()-issueDays)*daySecs }
		label = func(d entitlement.YMD) string { return fmt.Sprintf("%04d-%02d-%02d", d.Y, d.M, d.D) } // the demo civil date
	}
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
			CouponNumber: int(k), PeriodStart: label(prev), PeriodEnd: label(end),
			RecordDate: dateTime(endTS), PaymentDate: dateTime(endTS + 2*daySecs),
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

// seriesOf resolves {mint} → Series + money; writes the error response itself (404 for an unknown mint).
func seriesOf(w http.ResponseWriter, r *http.Request, rm ReadModel, st *store.Store) (solana.PublicKey, *chain.Series, money, bool) {
	mint, ok := pathKey(w, r, "mint")
	if !ok {
		return mint, nil, money{}, false
	}
	pda, err := rm.SeriesPDA(mint)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return pda, nil, money{}, false
	}
	s, err := rm.FetchSeries(r.Context(), pda)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return pda, nil, money{}, false
	}
	if s == nil {
		writeError(w, http.StatusNotFound, "no series for mint "+mint.String())
		return pda, nil, money{}, false
	}
	m, err := cashMoney(r.Context(), rm, st, s.CashMint)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return pda, nil, money{}, false
	}
	return pda, s, m, true
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

	loadSeries := func(w http.ResponseWriter, r *http.Request) (solana.PublicKey, *chain.Series, money, bool) {
		return seriesOf(w, r, rm, st)
	}

	r.Get("/series", func(w http.ResponseWriter, r *http.Request) {
		// Series an admin hid (platform v2 §5.2) stay on-chain but leave every public list; ?featured=1 keeps
		// only admin-curated series, and featured ones always list first (task 1525).
		settings, err := st.ListSeriesSettings(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		featuredOnly := r.URL.Query().Get("featured") == "1"
		// Task 1524: sandboxes stay out of the public listing unless the caller owns them (qupon_sandbox cookie).
		mine := sandboxCookieID(r)
		skip := func(set store.SeriesSettings) bool {
			return set.Hidden || (featuredOnly && !set.Featured) || (set.SandboxID != "" && set.SandboxID != mine)
		}
		if rm == nil { // no chain reader: serve the mirror indexed at startup
			rows, err := st.ListSeries(r.Context())
			if err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			out := make([]json.RawMessage, 0, len(rows))
			for _, row := range rows {
				if skip(settings[row.Mint]) {
					continue
				}
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
		kept := make([]SeriesDTO, 0, len(recs))
		for _, rec := range recs {
			set := settings[rec.Series.Mint.String()]
			if skip(set) {
				continue
			}
			m, err := cashMoney(r.Context(), rm, st, rec.Series.CashMint)
			if err != nil {
				fail(w, err)
				return
			}
			kept = append(kept, seriesDTO(rec.PDA, rec.Series, m, set.Featured))
		}
		slices.SortStableFunc(kept, func(a, b SeriesDTO) int {
			switch { // featured first; within the showcase, ISIN order = the curated board order (showcase.go)
			case a.Featured && b.Featured:
				return strings.Compare(a.ISIN, b.ISIN)
			case a.Featured == b.Featured: // both non-featured: keep AllSeries order
				return 0
			case b.Featured:
				return 1
			default:
				return -1
			}
		})
		writeJSON(w, http.StatusOK, kept)
	})

	r.Get("/series/{mint}", need(func(w http.ResponseWriter, r *http.Request) {
		if pda, s, m, ok := loadSeries(w, r); ok {
			set, err := st.GetSeriesSettings(r.Context(), s.Mint.String())
			if err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, seriesDTO(pda, s, m, set.Featured))
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
		// Same series as the public list (hidden and sandbox series left out): scanning the actions of every
		// series on the program, test leftovers included, took over a minute through the RPC gateway.
		settings, err := st.ListSeriesSettings(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
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
			if set := settings[rec.Series.Mint.String()]; set.Hidden || set.SandboxID != "" {
				continue
			}
			m, err := cashMoney(r.Context(), rm, st, rec.Series.CashMint)
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
		m, err := cashMoney(r.Context(), rm, st, a.CashMint)
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

	// GET /actions/{pda}/bank-pending: the bank-routed payouts awaiting the paying agent's confirmation.
	r.Get("/actions/{pda}/bank-pending", need(func(w http.ResponseWriter, r *http.Request) {
		pda, a, _, m, ok := loadAction(w, r)
		if !ok {
			return
		}
		items, err := bankPendingPayouts(r.Context(), rm, pda, a, m)
		if err != nil {
			fail(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"bankPending": a.BankPending, "items": items})
	}))
}
