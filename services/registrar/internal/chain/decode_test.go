package chain

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/qupon-kz/qupon/services/registrar/internal/borsh"
	solana "github.com/solana-foundation/solana-go/v2"
)

func pk(t *testing.T, s string) solana.PublicKey {
	t.Helper()
	k, err := solana.PublicKeyFromBase58(s)
	if err != nil {
		t.Fatalf("bad pubkey %q: %v", s, err)
	}
	return k
}

func pad12(s string) [12]byte { var b [12]byte; copy(b[:], s); return b }

func pad16(s string) [16]byte { var b [16]byte; copy(b[:], s); return b }

// encodeSeries is the test-only mirror of DecodeSeries (Rust layout in state.rs).
func encodeSeries(s *Series) []byte {
	return borsh.NewWriter().
		U8(s.Bump).
		Pubkey(s.Mint).
		Pubkey(s.CashMint).
		Pubkey(s.Registrar).
		Pubkey(s.Issuer).
		Pubkey(s.PayingAgent).
		FixedBytes(s.ISIN[:]).
		FixedBytes(s.Ticker[:]).
		U64(s.FaceValue).
		U32(s.CouponRateBps).
		U8(s.Frequency).
		U8(s.DayCount).
		I64(s.IssueDate).
		I64(s.MaturityDate).
		I64(s.NextCouponDate).
		I64(s.PeriodStart).
		U8(s.Status).
		U64(s.TotalIssued).
		U32(s.ActionCount).
		U16(s.QuorumBps).
		U16(s.ApprovalBps).
		Pubkey(s.TaxVault).
		OptionPubkey((*[32]byte)(s.OpenAction)).
		U32(s.OpenTrades).
		FixedBytes(s.Reserved[:]).
		Bytes()
}

func encodeInvestor(i *Investor) []byte {
	return borsh.NewWriter().
		U8(i.Bump).
		Pubkey(i.Series).
		Pubkey(i.Owner).
		Pubkey(i.BondATA).
		Pubkey(i.CashATA).
		U8(i.InvestorType).
		U8(i.Residency).
		U16(i.TaxRateBps).
		U8(i.Status).
		Pubkey(i.KYCRef).
		I64(i.RegisteredAt).
		Bytes()
}

func encodeCorporateAction(a *CorporateAction) []byte {
	return borsh.NewWriter().
		U8(a.Bump).
		Pubkey(a.Series).
		U32(a.Index).
		U8(a.Kind).
		U8(a.Mandatory).
		FixedBytes(a.CorpID[:]).
		FixedBytes(a.OfficialID[:]).
		I64(a.AnnouncedAt).
		I64(a.RecordAt).
		I64(a.PaymentAt).
		I64(a.PeriodStart).
		I64(a.PeriodEnd).
		U32(a.AccrualDays).
		U32(a.RateBps).
		U64(a.PerUnitGross).
		U64(a.PerUnitPrincipal).
		Pubkey(a.CashMint).
		Pubkey(a.Escrow).
		U8(a.Status).
		U64(a.SnapshotSlot).
		Pubkey(a.SnapshotHash).
		U64(a.UnitsSnapshotted).
		U32(a.HoldersSnapshotted).
		U32(a.HoldersPaid).
		U64(a.TotalGross).
		U64(a.TotalTax).
		U64(a.TotalNet).
		U64(a.TotalPaid).
		U64(a.TotalRetired).
		U32(a.HoldersRetired).
		U32(a.ProposalNewRateBps).
		I64(a.ProposalNewMaturity).
		I64(a.VotingEndsAt).
		U64(a.VotesFor).
		U64(a.VotesAgainst).
		U64(a.VotesAbstain).
		U8(a.Result).
		I64(a.CompletedAt).
		U16(a.FactorBps).
		U64(a.TotalPrincipal).
		FixedBytes(a.Reserved[:]).
		Bytes()
}

func encodeEntitlement(e *Entitlement) []byte {
	return borsh.NewWriter().
		U8(e.Bump).
		Pubkey(e.Action).
		Pubkey(e.Owner).
		U64(e.Units).
		U64(e.Gross).
		U64(e.Tax).
		U64(e.Net).
		U64(e.Principal).
		U8(e.Status).
		I64(e.PaidAt).
		U8(e.Vote).
		I64(e.VotedAt).
		Bytes()
}

func TestDecodeSeriesRoundTrip(t *testing.T) {
	base := Series{
		Bump:           254,
		Mint:           pk(t, "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd"),
		CashMint:       pk(t, "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
		Registrar:      pk(t, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"),
		Issuer:         pk(t, "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNNjuMzaDmG4onrZDA"),
		PayingAgent:    pk(t, "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
		ISIN:           pad12("KZ1"),   // zero-padded like on-chain
		Ticker:         pad16("QPNB1"), // zero-padded ascii
		FaceValue:      1_000_000,      // 1,000 KZT in tiyn
		CouponRateBps:  1000,           // 10%
		Frequency:      2,
		DayCount:       0,
		IssueDate:      1_770_000_000,
		MaturityDate:   1_803_542_400,
		NextCouponDate: 1_775_299_200,
		PeriodStart:    1_770_000_000,
		Status:         0,
		TotalIssued:    10_000,
		ActionCount:    1,
		QuorumBps:      6667,
		ApprovalBps:    5000,
		TaxVault:       pk(t, "AVMoJ7VrsMQ8tPjxWZYeDb9nXZuVhxzXb2S2QZKtcHq"),
		OpenTrades:     2,
		Reserved:       [60]byte{},
	}
	// open_action: Borsh Option<Pubkey> after tax_vault — None and Some shapes.
	some := pk(t, "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNNjuMzaDmG4onrZDA")
	for name, open := range map[string]*solana.PublicKey{"none": nil, "some": &some} {
		t.Run(name, func(t *testing.T) {
			in := base
			in.OpenAction = open
			out, err := DecodeSeries(encodeSeries(&in))
			if err != nil {
				t.Fatalf("DecodeSeries: %v", err)
			}
			// DeepEqual, not !=: OpenAction is a pointer field.
			if !reflect.DeepEqual(out, &in) {
				t.Fatalf("round trip mismatch:\n got %+v\nwant %+v", *out, in)
			}
		})
	}
	// Some encodes as tag 1 + 32 bytes; None as tag 0 — one byte shorter.
	withSome := base
	withSome.OpenAction = &some
	if n, m := len(encodeSeries(&base)), len(encodeSeries(&withSome)); m != n+32 {
		t.Fatalf("Some open_action should add 32 bytes: none=%d some=%d", n, m)
	}
}

func TestDecodeInvestorRoundTrip(t *testing.T) {
	in := &Investor{
		Bump:         255,
		Series:       pk(t, "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd"),
		Owner:        pk(t, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"),
		BondATA:      pk(t, "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNNjuMzaDmG4onrZDA"),
		CashATA:      pk(t, "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
		InvestorType: 1,
		Residency:    1,
		TaxRateBps:   2000,
		Status:       0,
		KYCRef:       [32]byte{7},
		RegisteredAt: 1_770_000_001,
	}
	out, err := DecodeInvestor(encodeInvestor(in))
	if err != nil {
		t.Fatalf("DecodeInvestor: %v", err)
	}
	if *out != *in {
		t.Fatalf("round trip mismatch:\n got %+v\nwant %+v", *out, *in)
	}
}

// TradeAdmission bytes built by hand in the Rust field order (state.rs): the reference trade of plan 13,
// 5 bonds at par = 500,000 tiyn. On-chain the account is 8 (discriminator) + 185 = 193 bytes.
func TestDecodeTradeAdmission(t *testing.T) {
	want := TradeAdmission{
		Bump:       254,
		Series:     pk(t, "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd"),
		SwapDvp:    pk(t, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"),
		Escrow:     pk(t, "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNNjuMzaDmG4onrZDA"),
		Seller:     pk(t, "AVMoJ7VrsMQ8tPjxWZYeDb9nXZuVhxzXb2S2QZKtcHq"),
		Buyer:      pk(t, "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
		Units:      5,
		CashAmount: 500_000,
		AdmittedAt: 1_790_000_000,
	}
	valid := borsh.NewWriter().
		U8(want.Bump).Pubkey(want.Series).Pubkey(want.SwapDvp).Pubkey(want.Escrow).
		Pubkey(want.Seller).Pubkey(want.Buyer).
		U64(want.Units).U64(want.CashAmount).I64(want.AdmittedAt).
		Bytes()
	if len(valid) != 185 || !bytes.Equal(valid[1:33], want.Series[:]) {
		t.Fatalf("fixture: %d bytes, want 185 with the series at body offset 1 (memcmp offset 9)", len(valid))
	}
	if !bytes.Equal(valid[161:169], []byte{5, 0, 0, 0, 0, 0, 0, 0}) || !bytes.Equal(valid[169:177], []byte{0x20, 0xa1, 0x07, 0, 0, 0, 0, 0}) {
		t.Fatalf("fixture: units / cash_amount are not u64 LE at offsets 161 / 169: %x", valid[161:177])
	}
	tests := []struct {
		name    string
		data    []byte
		wantErr string
	}{
		{name: "valid", data: valid},
		{name: "empty", data: nil, wantErr: "bump"},
		{name: "cut inside buyer", data: valid[:150], wantErr: "buyer"},
		{name: "cut before admitted_at", data: valid[:177], wantErr: "admitted_at"},
		{name: "trailing byte", data: append(bytes.Clone(valid), 0), wantErr: "trailing"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := DecodeTradeAdmission(tt.data)
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("err = %v, want one naming %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("DecodeTradeAdmission: %v", err)
			}
			if *got != want {
				t.Fatalf("got %+v\nwant %+v", *got, want)
			}
		})
	}
}

func TestDecodeCorporateActionRoundTrip(t *testing.T) {
	in := &CorporateAction{
		Bump:                253,
		Series:              pk(t, "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd"),
		Index:               1,
		Kind:                0, // INTR
		Mandatory:           0,
		CorpID:              pad16("QPNb1-INTR-0001"),
		OfficialID:          [16]byte{},
		AnnouncedAt:         1_775_000_000,
		RecordAt:            1_775_100_000,
		PaymentAt:           1_775_200_000,
		PeriodStart:         1_770_000_000,
		PeriodEnd:           1_775_299_200,
		AccrualDays:         182,
		RateBps:             1000,
		PerUnitGross:        50_000,
		PerUnitPrincipal:    0,
		CashMint:            pk(t, "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
		Escrow:              pk(t, "AVMoJ7VrsMQ8tPjxWZYeDb9nXZuVhxzXb2S2QZKtcHq"),
		Status:              2,
		SnapshotSlot:        300_000_001,
		SnapshotHash:        [32]byte{9},
		UnitsSnapshotted:    10_000,
		HoldersSnapshotted:  3,
		HoldersPaid:         0,
		TotalGross:          500_000_000,
		TotalTax:            20_000_000,
		TotalNet:            480_000_000,
		TotalPaid:           0,
		TotalRetired:        0,
		HoldersRetired:      0,
		ProposalNewRateBps:  0,
		ProposalNewMaturity: 0,
		VotingEndsAt:        0,
		VotesFor:            0,
		VotesAgainst:        0,
		VotesAbstain:        0,
		Result:              0,
		CompletedAt:         0,
		FactorBps:           2500, // PCAL 25%
		TotalPrincipal:      1_000_000,
		Reserved:            [64]byte{},
	}
	out, err := DecodeCorporateAction(encodeCorporateAction(in))
	if err != nil {
		t.Fatalf("DecodeCorporateAction: %v", err)
	}
	if *out != *in {
		t.Fatalf("round trip mismatch:\n got %+v\nwant %+v", *out, *in)
	}
}

func TestDecodeEntitlementRoundTrip(t *testing.T) {
	in := &Entitlement{
		Bump:      252,
		Action:    pk(t, "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"),
		Owner:     pk(t, "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNNjuMzaDmG4onrZDA"),
		Units:     1_250, // brief's numbers: 25 units × 10% semi-annual → 1,250 tiyn... principal 25,000
		Gross:     1_250,
		Tax:       250,
		Net:       1_000,
		Principal: 25_000,
		Status:    1,
		PaidAt:    1_775_210_000,
		Vote:      3,
		VotedAt:   1_775_150_000,
	}
	out, err := DecodeEntitlement(encodeEntitlement(in))
	if err != nil {
		t.Fatalf("DecodeEntitlement: %v", err)
	}
	if *out != *in {
		t.Fatalf("round trip mismatch:\n got %+v\nwant %+v", *out, *in)
	}
}

func TestDecodeTruncatedAndTrailing(t *testing.T) {
	full := encodeEntitlement(&Entitlement{Bump: 1})
	for n := 0; n < len(full); n++ {
		if _, err := DecodeEntitlement(full[:n]); err == nil {
			t.Fatalf("DecodeEnt truncated to %d should fail", n)
		}
	}
	if _, err := DecodeEntitlement(append(full, 0)); err == nil {
		t.Fatal("DecodeEnt with trailing byte should fail")
	}
}

// idlDiscriminator returns the discriminator Anchor wrote into the IDL for the
// named account, accepting both IDL shapes (byte array or base64 string).
func idlDiscriminator(t *testing.T, idl map[string]json.RawMessage, account string) [8]byte {
	t.Helper()
	var accounts []struct {
		Name          string          `json:"name"`
		Discriminator json.RawMessage `json:"discriminator"`
	}
	if err := json.Unmarshal(idl["accounts"], &accounts); err != nil {
		t.Fatalf("parse idl accounts: %v", err)
	}
	for _, a := range accounts {
		if !strings.EqualFold(a.Name, account) {
			continue
		}
		var arr []uint8
		if err := json.Unmarshal(a.Discriminator, &arr); err == nil {
			var d [8]byte
			copy(d[:], arr)
			return d
		}
		var s string
		if err := json.Unmarshal(a.Discriminator, &s); err == nil {
			raw, err := base64.StdEncoding.DecodeString(s)
			if err != nil || len(raw) != 8 {
				t.Fatalf("idl discriminator for %s: bad base64 %q", account, s)
			}
			var d [8]byte
			copy(d[:], raw)
			return d
		}
		t.Fatalf("idl discriminator for %s: unsupported shape %s", account, a.Discriminator)
	}
	t.Fatalf("account %s not in idl", account)
	return [8]byte{}
}

// TestSeriesDiscriminatorMatchesIDL checks our sha256("account:Series")[:8]
// against the IDL produced by `anchor build`; skipped when the IDL is absent
// (clean checkout, no Rust toolchain).
func TestSeriesDiscriminatorMatchesIDL(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "target", "idl", "qupon_bonds.json")
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		t.Skipf("no IDL at %s (run anchor build)", path)
	}
	if err != nil {
		t.Fatal(err)
	}
	var idl map[string]json.RawMessage
	if err := json.Unmarshal(raw, &idl); err != nil {
		t.Fatal(err)
	}
	want := idlDiscriminator(t, idl, "Series")
	got, err := borsh.AnchorDiscriminator("account", "Series")
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("Series discriminator = %x, IDL says %x", got, want)
	}
}

// On chain the Series account is allocated at its max size, so a None open_action leaves 32 zero bytes of padding
// (found against devnet: every live Series failed with "32 trailing bytes").
func TestDecodeSeriesAllocatedPadding(t *testing.T) {
	in := Series{FaceValue: 100_000, CouponRateBps: 1000, Frequency: 2}
	padded := append(encodeSeries(&in), make([]byte, 32)...)
	out, err := DecodeSeries(padded)
	if err != nil {
		t.Fatalf("padded None: %v", err)
	}
	if out.OpenAction != nil || out.FaceValue != 100_000 {
		t.Fatalf("decoded %+v", out)
	}
	if _, err := DecodeSeries(append(encodeSeries(&in), make([]byte, 33)...)); err == nil {
		t.Fatal("33 trailing bytes must still be rejected")
	}
	junk := append(encodeSeries(&in), make([]byte, 32)...)
	junk[len(junk)-1] = 7
	if _, err := DecodeSeries(junk); err == nil {
		t.Fatal("non-zero padding must be rejected")
	}
}

// Task 1511 (plan 15 D7): DaySecs/IssueYmd are carved from Reserved after the hook fields.
func TestDecodeSeriesDemoClock(t *testing.T) {
	in := Series{Mint: pk(t, "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd"), Status: 0}
	in.Reserved = [60]byte{}
	binary.LittleEndian.PutUint32(in.Reserved[22:26], 1)          // day_secs = 1 s civil day
	binary.LittleEndian.PutUint32(in.Reserved[26:30], 20_261_009) // issue 2026-10-09
	in.DaySecs, in.IssueYmd = 1, 20_261_009
	out, err := DecodeSeries(encodeSeries(&in))
	if err != nil {
		t.Fatalf("DecodeSeries: %v", err)
	}
	if out.DaySecs != 1 || out.IssueYmd != 20_261_009 {
		t.Fatalf("demo clock fields = %d/%d, want 1/20261009", out.DaySecs, out.IssueYmd)
	}
	if !reflect.DeepEqual(out, &in) {
		t.Fatalf("round trip mismatch:\n got %+v\nwant %+v", *out, in)
	}
	// All-zero reserved (every legacy series) reads as the real clock.
	legacy := in
	legacy.Reserved = [60]byte{}
	legacy.DaySecs, legacy.IssueYmd = 0, 0
	out, err = DecodeSeries(encodeSeries(&legacy))
	if err != nil || out.DaySecs != 0 || out.IssueYmd != 0 {
		t.Fatalf("legacy series = %+v (%v), want zero demo fields", out, err)
	}
}
