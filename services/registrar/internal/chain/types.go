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
	Reserved       [64]byte
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
	Reserved            [64]byte
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
	Status    uint8 // 0 Snapshotted, 1 Paid, 2 Retired
	PaidAt    int64
	Vote      uint8 // 0 None, 1 For, 2 Against, 3 Abstain
	VotedAt   int64
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
		Status:         status,
		TotalIssued:    s.TotalIssued,
		ActionCount:    s.ActionCount,
		QuorumBps:      s.QuorumBps,
		ApprovalBps:    s.ApprovalBps,
		TaxVault:       s.TaxVault.String(),
	}
}
