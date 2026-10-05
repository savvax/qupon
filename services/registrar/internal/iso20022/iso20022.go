// Package iso20022 renders ISO 20022 corporate-action messages (seev.031
// notification, seev.036 movement confirmation) from on-chain state, following
// the mapping table in docs/03-domain.md §6. Pure: input is the chain account
// mirrors — no network code here. XSD validation against the official ISO
// schemas is out of scope (see README.md and fixtures/iso20022).
package iso20022

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"strconv"
	"time"
)

// Namespaces (latest versions in the ISO archive, Feb 2025).
const (
	NSSeev031 = "urn:iso:std:iso:20022:tech:xsd:seev.031.001.15"
	NSSeev036 = "urn:iso:std:iso:20022:tech:xsd:seev.036.001.16"
)

// almaty is the Kazakhstan market timezone (UTC+5, no DST).
var almaty = time.FixedZone("ALMT", 5*3600)

// kindCodes maps chain.CorporateAction.Kind to ISO event codes (CAEV).
var kindCodes = [...]string{"INTR", "REDM", "MCAL", "PCAL", "BMET", "CHAN"}

// mndtryCodes maps chain.CorporateAction.Mandatory to CAMV codes.
var mndtryCodes = [...]string{"MAND", "VOLU", "CHOS"}

// KindCode returns the CAEV event code for an action kind.
func KindCode(kind uint8) (string, error) {
	if int(kind) < len(kindCodes) {
		return kindCodes[kind], nil
	}
	return "", fmt.Errorf("iso20022: unknown action kind %d", kind)
}

// MndtryCode returns the CAMV code for the mandatory flag.
func MndtryCode(m uint8) (string, error) {
	if int(m) < len(mndtryCodes) {
		return mndtryCodes[m], nil
	}
	return "", fmt.Errorf("iso20022: unknown mandatory flag %d", m)
}

// DayCntBsis returns the ISO day-count basis code. ACT_ACT is rejected
// (UnsupportedDayCount on-chain, docs/03-domain.md §3).
func DayCntBsis(dayCount uint8) (string, error) {
	switch dayCount {
	case 0:
		return "A001", nil // THIRTY_360 (30E/360)
	case 2:
		return "A005", nil // ACT_365
	default:
		return "", fmt.Errorf("iso20022: day count %d not exportable", dayCount)
	}
}

// Rate renders bps as a percentage with 2 decimals (1000 bps → "10.00").
func Rate(bps uint32) string { return fmt.Sprintf("%d.%02d", bps/100, bps%100) }

// Amount renders a minor-unit integer with the cash mint's decimals
// (50000 @2 → "500.00"). ponytail: uint64 pow; mints never exceed 9 decimals.
func Amount(minor uint64, decimals int) string {
	if decimals <= 0 {
		return strconv.FormatUint(minor, 10)
	}
	if decimals > 18 {
		decimals = 18
	}
	pow := uint64(1)
	for i := 0; i < decimals; i++ {
		pow *= 10
	}
	return fmt.Sprintf("%d.%0*d", minor/pow, decimals, minor%pow)
}

// dt renders a unix timestamp as ISO 8601 with the Almaty offset.
func dt(ts int64) string { return time.Unix(ts, 0).In(almaty).Format(time.RFC3339) }

// day renders a unix timestamp as an Almaty calendar date.
func day(ts int64) string { return time.Unix(ts, 0).In(almaty).Format("2006-01-02") }

// fixedString trims the zero padding of a fixed-width on-chain ascii field.
func fixedString(b []byte) string {
	for i, c := range b {
		if c == 0 {
			return string(b[:i])
		}
	}
	return string(b)
}

// Marshal renders a Document with the XML header and two-space indent.
func Marshal(v any) ([]byte, error) {
	var buf bytes.Buffer
	buf.WriteString(xml.Header)
	enc := xml.NewEncoder(&buf)
	enc.Indent("", "  ")
	if err := enc.Encode(v); err != nil {
		return nil, fmt.Errorf("iso20022: encode: %w", err)
	}
	if err := enc.Close(); err != nil {
		return nil, fmt.Errorf("iso20022: close: %w", err)
	}
	buf.WriteByte('\n')
	return buf.Bytes(), nil
}
