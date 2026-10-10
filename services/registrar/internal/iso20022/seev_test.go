package iso20022

import (
	"bytes"
	"encoding/xml"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
)

const goldenDir = "../../../../fixtures/iso20022"

// The brief's coupon (brief_coupon_10 in fixtures/entitlement.json): units 10,
// face 1,000 KZT, 10% semi-annual 30/360 → gross/net 50,000 tiyn = 500.00 tKZT.
var (
	almatyTest   = time.FixedZone("ALMT", 5*3600)
	testAnnounce = time.Date(2026, 7, 3, 0, 0, 0, 0, almatyTest).Unix()
	testRecord   = time.Date(2027, 1, 3, 0, 0, 0, 0, almatyTest).Unix()
	testPayment  = time.Date(2027, 1, 5, 12, 0, 0, 0, almatyTest).Unix()
	testOwner    = solana.MustPublicKeyFromBase58("DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo")
	testMint     = solana.MustPublicKeyFromBase58("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")
	testSig      = "SIMULATEDTxSignaturePlaceholder1111111111111111111111111"
)

func pad12(s string) [12]byte { var b [12]byte; copy(b[:], s); return b }
func pad16(s string) [16]byte { var b [16]byte; copy(b[:], s); return b }

func briefAction() *chain.CorporateAction {
	return &chain.CorporateAction{
		Kind:        0, // INTR
		Mandatory:   0, // MAND
		CorpID:      pad16("QPNb1-INTR-0001"),
		AnnouncedAt: testAnnounce,
		RecordAt:    testRecord,
		PaymentAt:   testPayment,
		PeriodStart: testAnnounce,
		PeriodEnd:   testRecord,
		RateBps:     1000,
	}
}

func briefSeries() *chain.Series {
	return &chain.Series{
		Mint:     testMint,
		ISIN:     pad12("KZ2C0QUPON01"),
		DayCount: 0, // THIRTY_360
	}
}

func briefEntitlement() *chain.Entitlement {
	return &chain.Entitlement{
		Owner: testOwner,
		Units: 10,
		Gross: 50_000,
		Tax:   0,
		Net:   50_000,
	}
}

// wellFormed validates via xmllint when installed, else the Go parser.
func wellFormed(t *testing.T, doc []byte) {
	t.Helper()
	if path, err := exec.LookPath("xmllint"); err == nil {
		cmd := exec.Command(path, "--noout", "-")
		cmd.Stdin = bytes.NewReader(doc)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("xmllint --noout: %v: %s", err, out)
		}
		return
	}
	dec := xml.NewDecoder(bytes.NewReader(doc))
	for {
		_, err := dec.Token()
		if err == io.EOF {
			return
		}
		if err != nil {
			t.Fatalf("xml parse: %v", err)
		}
	}
}

func mustRead(t *testing.T, name string) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(goldenDir, name))
	if err != nil {
		t.Fatalf("read golden: %v", err)
	}
	return strings.TrimRight(string(raw), "\n")
}

func TestSeev031Golden(t *testing.T) {
	doc, err := BuildSeev031(briefAction(), briefSeries(), Refs{})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	out, err := Marshal(doc)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	wellFormed(t, out)
	if got, want := strings.TrimRight(string(out), "\n"),
		mustRead(t, "seev031.QPNb1-INTR-0001.xml"); got != want {
		t.Errorf("seev.031 mismatch:\n got:\n%s\nwant:\n%s", got, want)
	}
}

func TestSeev036Golden(t *testing.T) {
	ata, _, err := solana.FindAssociatedTokenAddressWithProgram(testOwner, testMint, solana.Token2022ProgramID)
	if err != nil {
		t.Fatalf("derive ata: %v", err)
	}
	doc, err := BuildSeev036(briefAction(), briefSeries(), briefEntitlement(), ata,
		Cash{Ccy: "tKZT", Decimals: 2}, Refs{TxSignature: testSig, Cluster: "devnet"})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	out, err := Marshal(doc)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	wellFormed(t, out)

	// Structural compare against the golden; the golden's SIMULATED account
	// keys are not valid base58, so those two fields are normalized.
	var got, want Seev036Document
	if err := xml.Unmarshal(out, &got); err != nil {
		t.Fatalf("parse output: %v", err)
	}
	if err := xml.Unmarshal([]byte(mustRead(t, "seev036.QPNb1-INTR-0001.owner.xml")), &want); err != nil {
		t.Fatalf("parse golden: %v", err)
	}
	details := want.CorpActnMvmntConf.CorpActnConfDtls.AcctDtls
	details.AcctOwnr = testOwner.String()
	details.SfkpgAcct = ata.String()
	want.CorpActnMvmntConf.CorpActnConfDtls.AcctDtls = details
	if !reflect.DeepEqual(got, want) {
		t.Errorf("seev.036 mismatch:\n got %+v\nwant %+v", got, want)
	}

	// The brief's numbers, formatted with the cash mint decimals.
	for _, sub := range []string{
		`GrssCshAmt Ccy="tKZT">500.00<`,
		`NetCshAmt Ccy="tKZT">500.00<`,
		`WhldgTaxAmt Ccy="tKZT">0.00<`,
		`PstngAmt Ccy="tKZT">500.00<`,
		`<ConfdBal>10</ConfdBal>`,
	} {
		if !strings.Contains(string(out), sub) {
			t.Errorf("output missing %s", sub)
		}
	}
}

func TestSeev036PostingIncludesPrincipal(t *testing.T) {
	ata := solana.MustPublicKeyFromBase58("DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo")
	ent := briefEntitlement()
	ent.Principal = 1_000_000 // brief_redemption_10
	doc, err := BuildSeev036(briefAction(), briefSeries(), ent, ata,
		Cash{Ccy: "tKZT", Decimals: 2}, Refs{})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	move := doc.CorpActnMvmntConf.CorpActnConfDtls.CshMvmntDtls
	if move.PstngAmt.Value != "10500.00" {
		t.Errorf("PstngAmt = %s, want 10500.00 (net + principal)", move.PstngAmt.Value)
	}
}

func TestBuildRejectsUnsupportedDayCount(t *testing.T) {
	s := briefSeries()
	s.DayCount = 1 // ACT_ACT — UnsupportedDayCount on-chain
	if _, err := BuildSeev031(briefAction(), s, Refs{}); err == nil {
		t.Error("expected error for ACT_ACT day count")
	}
}

// Plan 15 D9: the anchored seev.031 must be deterministic — every timestamp
// comes from the action (CreDtTm = announced_at), never from wall clock.
func TestSeev031Deterministic(t *testing.T) {
	build := func() []byte {
		doc, err := BuildSeev031(briefAction(), briefSeries(), Refs{})
		if err != nil {
			t.Fatalf("build: %v", err)
		}
		out, err := Marshal(doc)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		return out
	}
	first, second := build(), build()
	if !bytes.Equal(first, second) {
		t.Fatal("seev.031 for the same action rendered different bytes twice")
	}
	if !strings.Contains(string(first), "<CreDtTm>2026-07-03T00:00:00+05:00</CreDtTm>") {
		t.Errorf("CreDtTm is not the action's announced_at:\n%s", first)
	}
}

// A bank-routed payout (PaidToAgent, plan 15 D6) is serviced by the paying
// agent — the confirmation names it as the account servicer.
func TestSeev036BankRoutedNamesAgentAsServicer(t *testing.T) {
	ata, _, err := solana.FindAssociatedTokenAddressWithProgram(testOwner, testMint, solana.Token2022ProgramID)
	if err != nil {
		t.Fatalf("derive ata: %v", err)
	}
	agent := solana.PublicKey{9: 9}
	s := briefSeries()
	s.PayingAgent = agent

	ent := briefEntitlement()
	ent.Status = 3 // PaidToAgent
	doc, err := BuildSeev036(briefAction(), s, ent, ata, Cash{Ccy: "tKZT", Decimals: 2}, Refs{})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if got := doc.CorpActnMvmntConf.CorpActnConfDtls.AcctDtls.AcntSvcr; got != agent.String() {
		t.Errorf("AcntSvcr = %q, want the paying agent %s", got, agent)
	}

	ent.Status = 1 // wallet payout: no servicer
	doc, err = BuildSeev036(briefAction(), s, ent, ata, Cash{Ccy: "tKZT", Decimals: 2}, Refs{})
	if err != nil {
		t.Fatalf("build wallet: %v", err)
	}
	if got := doc.CorpActnMvmntConf.CorpActnConfDtls.AcctDtls.AcntSvcr; got != "" {
		t.Errorf("wallet-routed AcntSvcr = %q, want empty", got)
	}
}

func TestAmount(t *testing.T) {
	cases := []struct {
		minor    uint64
		decimals int
		want     string
	}{
		{50_000, 2, "500.00"},
		{0, 2, "0.00"},
		{5_000, 0, "5000"},
		{239_250_000, 6, "239.250000"}, // usdc_btrk_3
		{1, 2, "0.01"},
	}
	for _, c := range cases {
		if got := Amount(c.minor, c.decimals); got != c.want {
			t.Errorf("Amount(%d, %d) = %s, want %s", c.minor, c.decimals, got, c.want)
		}
	}
}

func TestRate(t *testing.T) {
	for _, c := range []struct {
		bps  uint32
		want string
	}{
		{1000, "10.00"}, {1595, "15.95"}, {12, "0.12"},
	} {
		if got := Rate(c.bps); got != c.want {
			t.Errorf("Rate(%d) = %s, want %s", c.bps, got, c.want)
		}
	}
}
