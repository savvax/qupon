// Package chain holds Go mirrors of the on-chain accounts (docs/02-architecture.md).
// Field order and types mirror the Rust layout exactly — hand-written Borsh
// decoders (added with the reader task) rely on it.
package chain

import (
	"strings"

	solana "github.com/solana-foundation/solana-go/v2"
)

// Series mirrors the on-chain `Series` account (seeds ["series", mint]).
type Series struct {
	Bump           uint8
	Mint           solana.PublicKey
	CashMint       solana.PublicKey
	Registrar      solana.PublicKey
	Issuer         solana.PublicKey
	PayingAgent    solana.PublicKey
	ISIN           [12]byte
	Ticker         [16]byte
	FaceValue      uint64
	CouponRateBps  uint32
	Frequency      uint8 // 1, 2, 4, 12
	DayCount       uint8 // 0 THIRTY_360, 1 ACT_ACT, 2 ACT_365
	IssueDate      int64
	MaturityDate   int64
	NextCouponDate int64
	PeriodStart    int64
	Status         uint8 // 0 Active, 1 Matured, 2 Retiring, 3 Closed
	TotalIssued    uint64
	ActionCount    uint32
	QuorumBps      uint16
	ApprovalBps    uint16
	TaxVault       solana.PublicKey
	OpenAction     *solana.PublicKey // nil = Borsh None; the one non-final action, if any
	OpenTrades     uint32            // admitted Solana DvP trades not yet released (carved from reserved: older series read 0)
	Reserved       [60]byte
	// Carved from Reserved (plan 15; the account size is unchanged and older series read 0):
	// [0] hook, [1] record_kind, [2:6] record_seq, [6:14] record_at, [14:18] ckpt_count, [18:22] ckpt_late,
	// [22:26] day_secs, [26:30] issue_ymd, [30] in_default, [31:33] defaults_count, [33:60] still reserved.
	Hook       uint8  // 1 = the record date is the transfer-hook gate (D1'); 0 = legacy pause
	RecordKind uint8  // hooked: ActionKind of the pending record
	RecordSeq  uint32 // hooked: action index + 1 of the pending (or last) record
	RecordAt   int64  // hooked: record_at of the pending record; 0 = none pending
	CkptCount  uint32 // hooked: holder checkpoints (positions) registered
	CkptLate   uint32 // hooked: checkpoints registered after the pending record_at
	// DaySecs/IssueYmd: 0 = real Almaty clock, 1..86 399 s per civil day = demo clock anchored at
	// IssueDate/IssueYmd (plan 15 D7; label the series DEMO).
	DaySecs       uint32
	IssueYmd      uint32
	InDefault     uint8  // 1 while an action is Defaulted and not cured (D4)
	DefaultsCount uint16 // defaults ever declared on this series (public credit signal)
}

// TradeAdmission mirrors the on-chain `TradeAdmission` account (seeds ["trade", series, swap_dvp]):
// one admitted Solana DvP trade, closed by `release_trade` (docs/03-domain.md §4a).
type TradeAdmission struct {
	Bump       uint8
	Series     solana.PublicKey
	SwapDvp    solana.PublicKey // the Solana DvP program's SwapDvp record
	Escrow     solana.PublicKey // bond-leg escrow (ATA of SwapDvp for the bond mint)
	Seller     solana.PublicKey // wallet delivering the bonds
	Buyer      solana.PublicKey // wallet paying the cash
	Units      uint64
	CashAmount uint64
	AdmittedAt int64
}

// TradeRecord pairs a TradeAdmission account with its PDA.
type TradeRecord struct {
	PDA   solana.PublicKey
	Trade *TradeAdmission
}

// Investor mirrors the on-chain `Investor` account (seeds ["investor", series, owner]).
type Investor struct {
	Bump         uint8
	Series       solana.PublicKey
	Owner        solana.PublicKey
	BondATA      solana.PublicKey
	CashATA      solana.PublicKey
	InvestorType uint8 // 0 Individual, 1 Legal
	Residency    uint8 // 0 Resident, 1 NonResident
	TaxRateBps   uint16
	Status       uint8 // 0 Active, 1 Suspended
	KYCRef       [32]byte
	RegisteredAt int64
}

// CorporateAction mirrors the on-chain `CorporateAction` account
// (seeds ["action", series, action_index:u32 LE]).
type CorporateAction struct {
	Bump                uint8
	Series              solana.PublicKey
	Index               uint32
	Kind                uint8 // 0 INTR, 1 REDM, 2 MCAL, 3 PCAL, 4 BMET, 5 CHAN
	Mandatory           uint8 // 0 MAND, 1 VOLU, 2 CHOS
	CorpID              [16]byte
	OfficialID          [16]byte
	AnnouncedAt         int64
	RecordAt            int64
	PaymentAt           int64
	PeriodStart         int64
	PeriodEnd           int64
	AccrualDays         uint32
	RateBps             uint32
	PerUnitGross        uint64
	PerUnitPrincipal    uint64
	CashMint            solana.PublicKey
	Escrow              solana.PublicKey
	Status              uint8 // 0 Announced … 9 Finalized
	SnapshotSlot        uint64
	SnapshotHash        [32]byte
	UnitsSnapshotted    uint64
	HoldersSnapshotted  uint32
	HoldersPaid         uint32
	TotalGross          uint64
	TotalTax            uint64
	TotalNet            uint64
	TotalPaid           uint64
	TotalRetired        uint64
	HoldersRetired      uint32
	ProposalNewRateBps  uint32
	ProposalNewMaturity int64
	VotingEndsAt        int64
	VotesFor            uint64
	VotesAgainst        uint64
	VotesAbstain        uint64
	Result              uint8 // 0 Pending, 1 Approved, 2 Rejected, 3 NoQuorum
	CompletedAt         int64
	FactorBps           uint16 // PCAL only: share of face redeemed, bps
	TotalPrincipal      uint64 // Σ holder principal (REDM/MCAL/PCAL)
	Reserved            [64]byte
	// Carved from Reserved (plan 15): [0] hash_scheme, [1:5] positions_done, [5:13] defaulted_at, [13:21] cured_at,
	// [21:25] bank_pending, [25:57] disclosure_hash, [57:61] finalize_delay, [61:64] still reserved.
	// HashScheme (D3): 0 = rolling sha256 over owner-sorted holders, 1 = order-independent set hash
	// (XOR of sha256("qupon:snap:v1" ‖ action ‖ owner ‖ units_le)).
	HashScheme     uint8
	PositionsDone  uint32   // hooked snapshot: positions processed
	DefaultedAt    int64    // D4: when declare_default ran; 0 = never
	CuredAt        int64    // D4: when late funding cured the default; 0 = not cured
	BankPending    uint32   // D6: bank-routed payouts awaiting the paying agent's confirmation
	DisclosureHash [32]byte // D9: sha256 of the official notice (seev.031); zero = not anchored
	FinalizeDelay  uint32   // seconds from record_at to finalize_snapshot (default deadline base)
}

// Entitlement mirrors the on-chain `Entitlement` account
// (seeds ["entitlement", action, owner]).
type Entitlement struct {
	Bump      uint8
	Action    solana.PublicKey
	Owner     solana.PublicKey
	Units     uint64
	Gross     uint64
	Tax       uint64
	Net       uint64
	Principal uint64
	Status    uint8 // 0 Snapshotted, 1 Paid, 2 Retired, 3 PaidToAgent (bank route, awaiting confirmation)
	PaidAt    int64
	Vote      uint8 // 0 None, 1 For, 2 Against, 3 Abstain
	VotedAt   int64
}

// PayoutRoute mirrors the on-chain `PayoutRoute` account (seeds ["route", investor], plan 15 D6): where the
// holder asked payouts to go. Set only by the holder's signature; absent = the registered wallet cash account.
type PayoutRoute struct {
	Bump        uint8
	Investor    solana.PublicKey // the Investor PDA
	Route       uint8            // 0 wallet, 1 bank (payout to the paying agent; bank transfer SIMULATED)
	BankRefHash [32]byte         // sha256 of the bank details; zero for the wallet route
	UpdatedAt   int64
}

// PayoutRouteRecord pairs a PayoutRoute account with its PDA.
type PayoutRouteRecord struct {
	PDA   solana.PublicKey
	Route *PayoutRoute
}

// EntitlementStatusName maps an EntitlementStatus code (state.rs) to its name.
func EntitlementStatusName(code uint8) string {
	names := [...]string{"Snapshotted", "Paid", "Retired", "PaidToAgent"}
	if int(code) < len(names) {
		return names[code]
	}
	return "Unknown"
}

// ActionStatusName maps an ActionStatus code (state.rs) to its name.
func ActionStatusName(code uint8) string {
	actionStatusNames := [...]string{
		"Announced", "RecordStruck", "SnapshotComplete", "Funded", "Settling",
		"Completed", "Retiring", "Cancelled", "VotingOpen", "Finalized", "Defaulted",
	}
	if int(code) < len(actionStatusNames) {
		return actionStatusNames[code]
	}
	return "Unknown"
}

// InvestorRecord pairs an Investor account with its PDA.
type InvestorRecord struct {
	PDA      solana.PublicKey
	Investor *Investor
}

// EntitlementRecord pairs an Entitlement account with its PDA.
type EntitlementRecord struct {
	PDA         solana.PublicKey
	Entitlement *Entitlement
}

// SeriesView is the JSON projection served by GET /series: pubkeys as base58
// and fixed-width ascii fields trimmed of their zero padding.
type SeriesView struct {
	PDA            string `json:"pda"`
	Mint           string `json:"mint"`
	CashMint       string `json:"cashMint"`
	Registrar      string `json:"registrar"`
	Issuer         string `json:"issuer"`
	PayingAgent    string `json:"payingAgent"`
	ISIN           string `json:"isin"`
	Ticker         string `json:"ticker"`
	FaceValue      uint64 `json:"faceValue"`
	CouponRateBps  uint32 `json:"couponRateBps"`
	Frequency      uint8  `json:"frequency"`
	DayCount       string `json:"dayCount"`
	IssueDate      int64  `json:"issueDate"`
	MaturityDate   int64  `json:"maturityDate"`
	NextCouponDate int64  `json:"nextCouponDate"`
	DaySecs        uint32 `json:"daySecs"` // > 0 = demo clock (plan 15 D7)
	Status         string `json:"status"`
	TotalIssued    uint64 `json:"totalIssued"`
	ActionCount    uint32 `json:"actionCount"`
	QuorumBps      uint16 `json:"quorumBps"`
	ApprovalBps    uint16 `json:"approvalBps"`
	TaxVault       string `json:"taxVault"`
}

var (
	seriesStatusNames = [...]string{"Active", "Matured", "Retiring", "Closed"}
	dayCountNames     = [...]string{"THIRTY_360", "ACT_ACT", "ACT_365"}
)

// View projects the Series account for the REST API.
func (s *Series) View(pda solana.PublicKey) SeriesView {
	status, dayCount := "Unknown", "Unknown"
	if int(s.Status) < len(seriesStatusNames) {
		status = seriesStatusNames[s.Status]
	}
	if int(s.DayCount) < len(dayCountNames) {
		dayCount = dayCountNames[s.DayCount]
	}
	return SeriesView{
		PDA:            pda.String(),
		Mint:           s.Mint.String(),
		CashMint:       s.CashMint.String(),
		Registrar:      s.Registrar.String(),
		Issuer:         s.Issuer.String(),
		PayingAgent:    s.PayingAgent.String(),
		ISIN:           strings.TrimRight(string(s.ISIN[:]), "\x00"),
		Ticker:         strings.TrimRight(string(s.Ticker[:]), "\x00"),
		FaceValue:      s.FaceValue,
		CouponRateBps:  s.CouponRateBps,
		Frequency:      s.Frequency,
		DayCount:       dayCount,
		IssueDate:      s.IssueDate,
		MaturityDate:   s.MaturityDate,
		NextCouponDate: s.NextCouponDate,
		DaySecs:        s.DaySecs,
		Status:         status,
		TotalIssued:    s.TotalIssued,
		ActionCount:    s.ActionCount,
		QuorumBps:      s.QuorumBps,
		ApprovalBps:    s.ApprovalBps,
		TaxVault:       s.TaxVault.String(),
	}
}
