// seev.036.001.16 MovementConfirmation — the per-holder cash-movement
// confirmation sent after pay_batch.
package iso20022

import (
	"encoding/xml"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
)

// Seev036Document is the root <Document> of a seev.036 confirmation.
type Seev036Document struct {
	XMLName           xml.Name          `xml:"Document"`
	Xmlns             string            `xml:"xmlns,attr"`
	CorpActnMvmntConf CorpActnMvmntConf `xml:"CorpActnMvmntConf"`
}

// CorpActnMvmntConf is the message body.
type CorpActnMvmntConf struct {
	CorpActnGnlInf   CorpActnGnlInf      `xml:"CorpActnGnlInf"`
	CorpActnConfDtls Seev036CorpActnDtls `xml:"CorpActnConfDtls"`
}

// Seev036CorpActnDtls carries the account and the cash movement.
type Seev036CorpActnDtls struct {
	AcctDtls struct {
		AcctOwnr  string `xml:"AcctOwnr"`  // owner wallet pubkey
		SfkpgAcct string `xml:"SfkpgAcct"` // bond ATA (base58)
		ConfdBal  uint64 `xml:"ConfdBal"`  // units at record date
	} `xml:"AcctDtls"`
	CshMvmntDtls struct {
		CdtDbtInd   string            `xml:"CdtDbtInd"`
		GrssCshAmt  CurrencyAndAmount `xml:"GrssCshAmt"`
		WhldgTaxAmt CurrencyAndAmount `xml:"WhldgTaxAmt"`
		NetCshAmt   CurrencyAndAmount `xml:"NetCshAmt"`
		PstngAmt    CurrencyAndAmount `xml:"PstngAmt"` // net + principal
		PstngDt     string            `xml:"PstngDt"`
		ValDt       string            `xml:"ValDt"`
	} `xml:"CshMvmntDtls"`
	SplmtryData *SplmtryData `xml:"SplmtryData,omitempty"`
}

// CurrencyAndAmount is an active-or-historic amount with a Ccy attribute.
type CurrencyAndAmount struct {
	Ccy   string `xml:"Ccy,attr"`
	Value string `xml:",chardata"`
}

// SplmtryData embeds the Solana proof in AddtlInf (docs/03-domain.md §6).
type SplmtryData struct {
	AddtlInf AddtlInf `xml:"AddtlInf"`
}

// AddtlInf holds the Solana references; nil fields are omitted.
type AddtlInf struct {
	TxSignature *string `xml:"TxSignature,omitempty"`
	Slot        *uint64 `xml:"Slot,omitempty"`
	ProgramId   *string `xml:"ProgramId,omitempty"`
	Cluster     *string `xml:"Cluster,omitempty"`
}

// Refs are the Solana proof fields embedded in SplmtryData/AddtlInf.
type Refs struct {
	TxSignature string // pay_batch signature; empty = not yet known
	Slot        uint64 // snapshot slot
	ProgramID   string
	Cluster     string
}

// Cash identifies the settlement currency of an action.
type Cash struct {
	Ccy      string // e.g. "tKZT"
	Decimals int    // cash mint decimals
}

// BuildSeev036 renders the confirmation for one holder's entitlement.
// postingDate uses ent.PaidAt when the holder was paid, else action.PaymentAt.
func BuildSeev036(
	act *chain.CorporateAction,
	series *chain.Series,
	ent *chain.Entitlement,
	bondATA solana.PublicKey,
	cash Cash,
	refs Refs,
) (*Seev036Document, error) {
	kind, err := KindCode(act.Kind)
	if err != nil {
		return nil, err
	}
	mnd, err := MndtryCode(act.Mandatory)
	if err != nil {
		return nil, err
	}

	doc := &Seev036Document{Xmlns: NSSeev036}
	inf := &doc.CorpActnMvmntConf.CorpActnGnlInf
	inf.CorpActnEvtId = CorpID(act)
	if offcl := fixedString(act.OfficialID[:]); offcl != "" {
		inf.OffclCorpActnEvtId = &offcl
	}
	inf.EvtTp = kind
	inf.MndtryVlntryEvtTp = mnd
	inf.UndrlygScty.FinInstrmId.ISIN = fixedString(series.ISIN[:])

	dtls := &doc.CorpActnMvmntConf.CorpActnConfDtls
	dtls.AcctDtls.AcctOwnr = ent.Owner.String()
	dtls.AcctDtls.SfkpgAcct = bondATA.String()
	dtls.AcctDtls.ConfdBal = ent.Units

	ts := ent.PaidAt
	if ts == 0 {
		ts = act.PaymentAt
	}
	cashMove := &dtls.CshMvmntDtls
	cashMove.CdtDbtInd = "CRDT"
	cashMove.GrssCshAmt = CurrencyAndAmount{cash.Ccy, Amount(ent.Gross, cash.Decimals)}
	cashMove.WhldgTaxAmt = CurrencyAndAmount{cash.Ccy, Amount(ent.Tax, cash.Decimals)}
	cashMove.NetCshAmt = CurrencyAndAmount{cash.Ccy, Amount(ent.Net, cash.Decimals)}
	cashMove.PstngAmt = CurrencyAndAmount{cash.Ccy, Amount(ent.Net+ent.Principal, cash.Decimals)}
	cashMove.PstngDt = day(ts)
	cashMove.ValDt = day(ts)
	dtls.SplmtryData = refs.splmtry()
	return doc, nil
}
