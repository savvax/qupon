// seev.031.001.15 CorporateActionNotification — the custodian announcement.
package iso20022

import (
	"encoding/xml"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
)

// Seev031Document is the root <Document> of a seev.031 notification.
type Seev031Document struct {
	XMLName        xml.Name       `xml:"Document"`
	Xmlns          string         `xml:"xmlns,attr"`
	CorpActnNtfctn CorpActnNtfctn `xml:"CorpActnNtfctn"`
}

// CorpActnNtfctn is the message body.
type CorpActnNtfctn struct {
	NtfctnGnlInf   *NtfctnGnlInf       `xml:"NtfctnGnlInf,omitempty"`
	CorpActnGnlInf CorpActnGnlInf      `xml:"CorpActnGnlInf"`
	CorpActnDtls   Seev031CorpActnDtls `xml:"CorpActnDtls"`
	SplmtryData    *SplmtryData        `xml:"SplmtryData,omitempty"`
}

// NtfctnGnlInf is the notification identification block (unused: ids are
// derivable from the corp id; kept for schema shape).
type NtfctnGnlInf struct {
	NtfctnId string `xml:"NtfctnId,omitempty"`
}

// CorpActnGnlInf is the shared event header (also seev.036).
type CorpActnGnlInf struct {
	CorpActnEvtId      string  `xml:"CorpActnEvtId"`
	OffclCorpActnEvtId *string `xml:"OffclCorpActnEvtId,omitempty"`
	EvtTp              string  `xml:"EvtTp"`
	MndtryVlntryEvtTp  string  `xml:"MndtryVlntryEvtTp"`
	UndrlygScty        struct {
		FinInstrmId struct {
			ISIN string `xml:"ISIN"`
		} `xml:"FinInstrmId"`
	} `xml:"UndrlygScty"`
}

// Seev031CorpActnDtls carries the event economics.
type Seev031CorpActnDtls struct {
	DtDtls struct {
		AnncmntDt string `xml:"AnncmntDt"`
		RcrdDt    string `xml:"RcrdDt"`
		PmtDt     string `xml:"PmtDt"`
	} `xml:"DtDtls"`
	PrdDtls struct {
		IntrstPrd struct {
			FrDt string `xml:"FrDt"`
			ToDt string `xml:"ToDt"`
		} `xml:"IntrstPrd"`
	} `xml:"PrdDtls"`
	RateAndAmtDtls struct {
		IntrstRateUsdForPmt string `xml:"IntrstRateUsdForPmt"`
	} `xml:"RateAndAmtDtls"`
	DayCntBsis string `xml:"DayCntBsis"`
}

// BuildSeev031 renders the notification for one action from on-chain state.
// refs carries the Solana proof fields (tx signature, slot, program id,
// cluster); an empty Refs omits SplmtryData.
func BuildSeev031(act *chain.CorporateAction, series *chain.Series, refs Refs) (*Seev031Document, error) {
	kind, err := KindCode(act.Kind)
	if err != nil {
		return nil, err
	}
	mnd, err := MndtryCode(act.Mandatory)
	if err != nil {
		return nil, err
	}
	basis, err := DayCntBsis(series.DayCount)
	if err != nil {
		return nil, err
	}

	doc := &Seev031Document{Xmlns: NSSeev031}
	inf := &doc.CorpActnNtfctn.CorpActnGnlInf
	inf.CorpActnEvtId = CorpID(act)
	if offcl := fixedString(act.OfficialID[:]); offcl != "" {
		inf.OffclCorpActnEvtId = &offcl
	}
	inf.EvtTp = kind
	inf.MndtryVlntryEvtTp = mnd
	inf.UndrlygScty.FinInstrmId.ISIN = fixedString(series.ISIN[:])

	dtls := &doc.CorpActnNtfctn.CorpActnDtls
	dtls.DtDtls.AnncmntDt = dt(act.AnnouncedAt)
	dtls.DtDtls.RcrdDt = dt(act.RecordAt)
	dtls.DtDtls.PmtDt = day(act.PaymentAt)
	dtls.PrdDtls.IntrstPrd.FrDt = day(act.PeriodStart)
	dtls.PrdDtls.IntrstPrd.ToDt = day(act.PeriodEnd)
	dtls.RateAndAmtDtls.IntrstRateUsdForPmt = Rate(act.RateBps)
	dtls.DayCntBsis = basis
	doc.CorpActnNtfctn.SplmtryData = refs.splmtry()
	return doc, nil
}

// CorpID returns the CORP event id of an action (e.g. "QPNb1-INTR-0001").
func CorpID(act *chain.CorporateAction) string { return fixedString(act.CorpID[:]) }

// splmtry builds the SplmtryData block; nil when no ref is set.
func (r Refs) splmtry() *SplmtryData {
	if r == (Refs{}) {
		return nil
	}
	s := &SplmtryData{}
	if r.TxSignature != "" {
		s.AddtlInf.TxSignature = &r.TxSignature // r is a value copy
	}
	if r.Slot != 0 {
		s.AddtlInf.Slot = &r.Slot
	}
	if r.ProgramID != "" {
		s.AddtlInf.ProgramId = &r.ProgramID
	}
	if r.Cluster != "" {
		s.AddtlInf.Cluster = &r.Cluster
	}
	return s
}
