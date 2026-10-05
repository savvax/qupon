// Real on-chain layout parity: decode fixtures/accounts/*.b64 (bytes written by the
// Anchor program itself) and assert every field against the *.json expected decode
// (produced by Anchor's own deserializer in programs/qupon_bonds/tests/export_fixtures.rs).
// A mismatch here means the Go decoder is wrong — never "fix" the fixture.
package chain

import (
	"bytes"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/qupon-kz/qupon/services/registrar/internal/borsh"
	solana "github.com/solana-foundation/solana-go/v2"
)

type realFixture struct {
	Kind     string          `json:"kind"`
	Pubkey   string          `json:"pubkey"`
	Expected json.RawMessage `json:"expected"`
}

// Full on-chain account bytes (incl. the 8-byte Anchor discriminator) + fixture meta.
func loadRealFixture(t *testing.T, name string) ([]byte, realFixture) {
	t.Helper()
	dir := filepath.Join("..", "..", "..", "..", "fixtures", "accounts")
	b64, err := os.ReadFile(filepath.Join(dir, name+".b64"))
	if err != nil {
		t.Fatalf("read %s.b64 (regenerate with EXPORT_FIXTURES=1 cargo test -p qupon_bonds --test export_fixtures): %v", name, err)
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(b64)))
	if err != nil {
		t.Fatalf("%s.b64 is not base64: %v", name, err)
	}
	if len(raw) < 8 {
		t.Fatalf("%s.b64: %d bytes is shorter than an Anchor discriminator", name, len(raw))
	}
	rawJSON, err := os.ReadFile(filepath.Join(dir, name+".json"))
	if err != nil {
		t.Fatalf("read %s.json: %v", name, err)
	}
	var f realFixture
	if err := json.Unmarshal(rawJSON, &f); err != nil {
		t.Fatalf("parse %s.json: %v", name, err)
	}
	return raw, f
}

// The .b64 prefix must equal sha256("account:<Name>")[:8] from the built IDL namespace.
func checkRealDiscriminator(t *testing.T, kind string, raw []byte) {
	t.Helper()
	names := map[string]string{
		"series": "Series", "investor": "Investor",
		"action": "CorporateAction", "entitlement": "Entitlement",
	}
	want, err := borsh.AnchorDiscriminator("account", names[kind])
	if err != nil {
		t.Fatalf("discriminator for %s: %v", kind, err)
	}
	if !bytes.Equal(raw[:8], want[:]) {
		t.Fatalf("%s discriminator = %x, want %x", kind, raw[:8], want)
	}
}

func eq[T comparable](t *testing.T, field string, got, want T) {
	t.Helper()
	if got != want {
		t.Errorf("%s: got %v, want %v", field, got, want)
	}
}

func eqPk(t *testing.T, field string, got solana.PublicKey, want string) {
	t.Helper()
	eq(t, field, got, pk(t, want))
}

// Zero-padded ASCII field (isin, ticker, corp_id…) compared trimmed.
func eqAscii(t *testing.T, field string, got []byte, want string) {
	t.Helper()
	eq(t, field, strings.TrimRight(string(got), "\x00"), want)
}

// Byte field (kyc_ref, snapshot_hash, reserved) compared as lowercase hex.
func eqHex(t *testing.T, field string, got []byte, want string) {
	t.Helper()
	eq(t, field, hex.EncodeToString(got), strings.ToLower(want))
}

func TestRealSeriesFixture(t *testing.T) {
	raw, f := loadRealFixture(t, "series")
	checkRealDiscriminator(t, "series", raw)
	got, err := DecodeSeries(raw[8:])
	if err != nil {
		t.Fatalf("DecodeSeries(real bytes): %v", err)
	}
	var want struct {
		Bump           uint8   `json:"bump"`
		Mint           string  `json:"mint"`
		CashMint       string  `json:"cash_mint"`
		Registrar      string  `json:"registrar"`
		Issuer         string  `json:"issuer"`
		PayingAgent    string  `json:"paying_agent"`
		ISIN           string  `json:"isin"`
		Ticker         string  `json:"ticker"`
		FaceValue      uint64  `json:"face_value"`
		CouponRateBps  uint32  `json:"coupon_rate_bps"`
		Frequency      uint8   `json:"frequency"`
		DayCount       uint8   `json:"day_count"`
		IssueDate      int64   `json:"issue_date"`
		MaturityDate   int64   `json:"maturity_date"`
		NextCouponDate int64   `json:"next_coupon_date"`
		PeriodStart    int64   `json:"period_start"`
		Status         uint8   `json:"status"`
		TotalIssued    uint64  `json:"total_issued"`
		ActionCount    uint32  `json:"action_count"`
		QuorumBps      uint16  `json:"quorum_bps"`
		ApprovalBps    uint16  `json:"approval_bps"`
		TaxVault       string  `json:"tax_vault"`
		OpenAction     *string `json:"open_action"`
		Reserved       string  `json:"reserved"`
	}
	if err := json.Unmarshal(f.Expected, &want); err != nil {
		t.Fatalf("parse series expected: %v", err)
	}
	eq(t, "bump", got.Bump, want.Bump)
	eqPk(t, "mint", got.Mint, want.Mint)
	eqPk(t, "cash_mint", got.CashMint, want.CashMint)
	eqPk(t, "registrar", got.Registrar, want.Registrar)
	eqPk(t, "issuer", got.Issuer, want.Issuer)
	eqPk(t, "paying_agent", got.PayingAgent, want.PayingAgent)
	eqAscii(t, "isin", got.ISIN[:], want.ISIN)
	eqAscii(t, "ticker", got.Ticker[:], want.Ticker)
	eq(t, "face_value", got.FaceValue, want.FaceValue)
	eq(t, "coupon_rate_bps", got.CouponRateBps, want.CouponRateBps)
	eq(t, "frequency", got.Frequency, want.Frequency)
	eq(t, "day_count", got.DayCount, want.DayCount)
	eq(t, "issue_date", got.IssueDate, want.IssueDate)
	eq(t, "maturity_date", got.MaturityDate, want.MaturityDate)
	eq(t, "next_coupon_date", got.NextCouponDate, want.NextCouponDate)
	eq(t, "period_start", got.PeriodStart, want.PeriodStart)
	eq(t, "status", got.Status, want.Status)
	eq(t, "total_issued", got.TotalIssued, want.TotalIssued)
	eq(t, "action_count", got.ActionCount, want.ActionCount)
	eq(t, "quorum_bps", got.QuorumBps, want.QuorumBps)
	eq(t, "approval_bps", got.ApprovalBps, want.ApprovalBps)
	eqPk(t, "tax_vault", got.TaxVault, want.TaxVault)
	switch {
	case want.OpenAction == nil:
		eq(t, "open_action", got.OpenAction, (*solana.PublicKey)(nil))
	case got.OpenAction == nil:
		t.Errorf("open_action: got nil, want %s", *want.OpenAction)
	default:
		eqPk(t, "open_action", *got.OpenAction, *want.OpenAction)
	}
	eqHex(t, "reserved", got.Reserved[:], want.Reserved)
	// Cross-check: the open action PDA is the action fixture itself.
	if want.OpenAction != nil {
		eqPk(t, "open_action→action fixture", *got.OpenAction, fixturePubkey(t, "action"))
	}
}

func TestRealInvestorFixture(t *testing.T) {
	raw, f := loadRealFixture(t, "investor")
	checkRealDiscriminator(t, "investor", raw)
	got, err := DecodeInvestor(raw[8:])
	if err != nil {
		t.Fatalf("DecodeInvestor(real bytes): %v", err)
	}
	var want struct {
		Bump         uint8  `json:"bump"`
		Series       string `json:"series"`
		Owner        string `json:"owner"`
		BondATA      string `json:"bond_ata"`
		CashATA      string `json:"cash_ata"`
		InvestorType uint8  `json:"investor_type"`
		Residency    uint8  `json:"residency"`
		TaxRateBps   uint16 `json:"tax_rate_bps"`
		Status       uint8  `json:"status"`
		KYCRef       string `json:"kyc_ref"`
		RegisteredAt int64  `json:"registered_at"`
	}
	if err := json.Unmarshal(f.Expected, &want); err != nil {
		t.Fatalf("parse investor expected: %v", err)
	}
	eq(t, "bump", got.Bump, want.Bump)
	eqPk(t, "series", got.Series, want.Series)
	eqPk(t, "owner", got.Owner, want.Owner)
	eqPk(t, "bond_ata", got.BondATA, want.BondATA)
	eqPk(t, "cash_ata", got.CashATA, want.CashATA)
	eq(t, "investor_type", got.InvestorType, want.InvestorType)
	eq(t, "residency", got.Residency, want.Residency)
	eq(t, "tax_rate_bps", got.TaxRateBps, want.TaxRateBps)
	eq(t, "status", got.Status, want.Status)
	eqHex(t, "kyc_ref", got.KYCRef[:], want.KYCRef)
	eq(t, "registered_at", got.RegisteredAt, want.RegisteredAt)
	eq(t, "series→series fixture", got.Series.String(), fixturePubkey(t, "series"))
}

func TestRealActionFixture(t *testing.T) {
	raw, f := loadRealFixture(t, "action")
	checkRealDiscriminator(t, "action", raw)
	got, err := DecodeCorporateAction(raw[8:])
	if err != nil {
		t.Fatalf("DecodeCorporateAction(real bytes): %v", err)
	}
	var want struct {
		Bump                uint8  `json:"bump"`
		Series              string `json:"series"`
		Index               uint32 `json:"index"`
		Kind                uint8  `json:"kind"`
		Mandatory           uint8  `json:"mandatory"`
		CorpID              string `json:"corp_id"`
		OfficialID          string `json:"official_id"`
		AnnouncedAt         int64  `json:"announced_at"`
		RecordAt            int64  `json:"record_at"`
		PaymentAt           int64  `json:"payment_at"`
		PeriodStart         int64  `json:"period_start"`
		PeriodEnd           int64  `json:"period_end"`
		AccrualDays         uint32 `json:"accrual_days"`
		RateBps             uint32 `json:"rate_bps"`
		PerUnitGross        uint64 `json:"per_unit_gross"`
		PerUnitPrincipal    uint64 `json:"per_unit_principal"`
		CashMint            string `json:"cash_mint"`
		Escrow              string `json:"escrow"`
		Status              uint8  `json:"status"`
		SnapshotSlot        uint64 `json:"snapshot_slot"`
		SnapshotHash        string `json:"snapshot_hash"`
		UnitsSnapshotted    uint64 `json:"units_snapshotted"`
		HoldersSnapshotted  uint32 `json:"holders_snapshotted"`
		HoldersPaid         uint32 `json:"holders_paid"`
		TotalGross          uint64 `json:"total_gross"`
		TotalTax            uint64 `json:"total_tax"`
		TotalNet            uint64 `json:"total_net"`
		TotalPaid           uint64 `json:"total_paid"`
		TotalRetired        uint64 `json:"total_retired"`
		HoldersRetired      uint32 `json:"holders_retired"`
		ProposalNewRateBps  uint32 `json:"proposal_new_rate_bps"`
		ProposalNewMaturity int64  `json:"proposal_new_maturity"`
		VotingEndsAt        int64  `json:"voting_ends_at"`
		VotesFor            uint64 `json:"votes_for"`
		VotesAgainst        uint64 `json:"votes_against"`
		VotesAbstain        uint64 `json:"votes_abstain"`
		Result              uint8  `json:"result"`
		CompletedAt         int64  `json:"completed_at"`
		FactorBps           uint16 `json:"factor_bps"`
		TotalPrincipal      uint64 `json:"total_principal"`
		Reserved            string `json:"reserved"`
	}
	if err := json.Unmarshal(f.Expected, &want); err != nil {
		t.Fatalf("parse action expected: %v", err)
	}
	eq(t, "bump", got.Bump, want.Bump)
	eqPk(t, "series", got.Series, want.Series)
	eq(t, "index", got.Index, want.Index)
	eq(t, "kind", got.Kind, want.Kind)
	eq(t, "mandatory", got.Mandatory, want.Mandatory)
	eqAscii(t, "corp_id", got.CorpID[:], want.CorpID)
	eqAscii(t, "official_id", got.OfficialID[:], want.OfficialID)
	eq(t, "announced_at", got.AnnouncedAt, want.AnnouncedAt)
	eq(t, "record_at", got.RecordAt, want.RecordAt)
	eq(t, "payment_at", got.PaymentAt, want.PaymentAt)
	eq(t, "period_start", got.PeriodStart, want.PeriodStart)
	eq(t, "period_end", got.PeriodEnd, want.PeriodEnd)
	eq(t, "accrual_days", got.AccrualDays, want.AccrualDays)
	eq(t, "rate_bps", got.RateBps, want.RateBps)
	eq(t, "per_unit_gross", got.PerUnitGross, want.PerUnitGross)
	eq(t, "per_unit_principal", got.PerUnitPrincipal, want.PerUnitPrincipal)
	eqPk(t, "cash_mint", got.CashMint, want.CashMint)
	eqPk(t, "escrow", got.Escrow, want.Escrow)
	eq(t, "status", got.Status, want.Status)
	eq(t, "snapshot_slot", got.SnapshotSlot, want.SnapshotSlot)
	eqHex(t, "snapshot_hash", got.SnapshotHash[:], want.SnapshotHash)
	eq(t, "units_snapshotted", got.UnitsSnapshotted, want.UnitsSnapshotted)
	eq(t, "holders_snapshotted", got.HoldersSnapshotted, want.HoldersSnapshotted)
	eq(t, "holders_paid", got.HoldersPaid, want.HoldersPaid)
	eq(t, "total_gross", got.TotalGross, want.TotalGross)
	eq(t, "total_tax", got.TotalTax, want.TotalTax)
	eq(t, "total_net", got.TotalNet, want.TotalNet)
	eq(t, "total_paid", got.TotalPaid, want.TotalPaid)
	eq(t, "total_retired", got.TotalRetired, want.TotalRetired)
	eq(t, "holders_retired", got.HoldersRetired, want.HoldersRetired)
	eq(t, "proposal_new_rate_bps", got.ProposalNewRateBps, want.ProposalNewRateBps)
	eq(t, "proposal_new_maturity", got.ProposalNewMaturity, want.ProposalNewMaturity)
	eq(t, "voting_ends_at", got.VotingEndsAt, want.VotingEndsAt)
	eq(t, "votes_for", got.VotesFor, want.VotesFor)
	eq(t, "votes_against", got.VotesAgainst, want.VotesAgainst)
	eq(t, "votes_abstain", got.VotesAbstain, want.VotesAbstain)
	eq(t, "result", got.Result, want.Result)
	eq(t, "completed_at", got.CompletedAt, want.CompletedAt)
	eq(t, "factor_bps", got.FactorBps, want.FactorBps)
	eq(t, "total_principal", got.TotalPrincipal, want.TotalPrincipal)
	eqHex(t, "reserved", got.Reserved[:], want.Reserved)
	eq(t, "series→series fixture", got.Series.String(), fixturePubkey(t, "series"))
}

func TestRealEntitlementFixture(t *testing.T) {
	raw, f := loadRealFixture(t, "entitlement")
	checkRealDiscriminator(t, "entitlement", raw)
	got, err := DecodeEntitlement(raw[8:])
	if err != nil {
		t.Fatalf("DecodeEntitlement(real bytes): %v", err)
	}
	var want struct {
		Bump      uint8  `json:"bump"`
		Action    string `json:"action"`
		Owner     string `json:"owner"`
		Units     uint64 `json:"units"`
		Gross     uint64 `json:"gross"`
		Tax       uint64 `json:"tax"`
		Net       uint64 `json:"net"`
		Principal uint64 `json:"principal"`
		Status    uint8  `json:"status"`
		PaidAt    int64  `json:"paid_at"`
		Vote      uint8  `json:"vote"`
		VotedAt   int64  `json:"voted_at"`
	}
	if err := json.Unmarshal(f.Expected, &want); err != nil {
		t.Fatalf("parse entitlement expected: %v", err)
	}
	eq(t, "bump", got.Bump, want.Bump)
	eqPk(t, "action", got.Action, want.Action)
	eqPk(t, "owner", got.Owner, want.Owner)
	eq(t, "units", got.Units, want.Units)
	eq(t, "gross", got.Gross, want.Gross)
	eq(t, "tax", got.Tax, want.Tax)
	eq(t, "net", got.Net, want.Net)
	eq(t, "principal", got.Principal, want.Principal)
	eq(t, "status", got.Status, want.Status)
	eq(t, "paid_at", got.PaidAt, want.PaidAt)
	eq(t, "vote", got.Vote, want.Vote)
	eq(t, "voted_at", got.VotedAt, want.VotedAt)
	eq(t, "action→action fixture", got.Action.String(), fixturePubkey(t, "action"))
}

// Pubkey of another fixture, for cross-PDA consistency checks.
func fixturePubkey(t *testing.T, name string) string {
	t.Helper()
	_, f := loadRealFixture(t, name)
	return f.Pubkey
}
