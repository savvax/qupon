// Package ingest polls the chain for qupon_bonds transactions and decodes
// Anchor events from `Program data:` log lines (base64, first 8 bytes =
// sha256("event:<Name>")[:8]) into the activity feed.
package ingest

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"log/slog"
	"slices"
	"strconv"
	"strings"

	solana "github.com/solana-foundation/solana-go/v2"
)

// field kinds: pk = Pubkey, bN = fixed [u8; N], bool = Borsh bool (1 byte).
type field struct {
	name string
	kind string
	n    int
}

func pk(name string) field         { return field{name, "pk", 0} }
func u8(name string) field         { return field{name, "u8", 0} }
func u16(name string) field        { return field{name, "u16", 0} }
func u32(name string) field        { return field{name, "u32", 0} }
func u64(name string) field        { return field{name, "u64", 0} }
func i64(name string) field        { return field{name, "i64", 0} }
func boolean(name string) field    { return field{name, "bool", 0} }
func arr(name string, n int) field { return field{name, "bytes", n} }

// layouts mirrors programs/qupon_bonds/src/events.rs field-for-field.
// TestLayoutsMatchIDL diffs this table against the generated IDL, so a
// program change that forgets to update Go fails `make verify`.
var layouts = map[string][]field{
	"SeriesInitialized": {pk("series"), pk("mint"), pk("cash_mint"), pk("registrar"), pk("issuer"), pk("paying_agent"),
		arr("isin", 12), arr("ticker", 16), u64("face_value"), u32("coupon_rate_bps"), u8("frequency"), u8("day_count"),
		i64("issue_date"), i64("maturity_date"), i64("next_coupon_date"), u64("slot"), i64("timestamp")},
	"InvestorRegistered": {pk("series"), pk("investor"), pk("owner"), pk("bond_ata"), pk("cash_ata"),
		u8("investor_type"), u8("residency"), u16("tax_rate_bps"), arr("kyc_ref", 32), u64("slot"), i64("timestamp")},
	"InvestorStatusChanged": {pk("series"), pk("investor"), pk("owner"), u8("status"), u64("slot"), i64("timestamp")},
	"Subscribed":            {pk("series"), pk("owner"), u64("units"), u64("price_per_unit"), u64("cash_paid"), u64("total_issued"), u64("slot"), i64("timestamp")},
	"UnitsIssued":           {pk("series"), pk("owner"), u64("units"), u64("total_issued"), u64("slot"), i64("timestamp")},
	"ActionAnnounced": {pk("series"), pk("action"), u32("index"), u8("kind"), u8("mandatory"), arr("corp_id", 16),
		arr("official_id", 16), i64("record_at"), i64("payment_at"), i64("period_start"), i64("period_end"),
		u32("accrual_days"), u32("rate_bps"), u64("per_unit_gross"), u64("per_unit_principal"), u16("factor_bps"),
		pk("cash_mint"), pk("escrow"), u32("proposal_new_rate_bps"), i64("proposal_new_maturity"),
		i64("voting_ends_at"), u64("slot"), i64("timestamp")},
	"ActionCancelled": {pk("series"), pk("action"), u32("index"), u64("slot"), i64("timestamp")},
	"RecordStruck":    {pk("series"), pk("action"), u32("index"), i64("record_at"), u64("snapshot_slot"), u64("slot"), i64("timestamp")},
	"HolderSnapshotted": {pk("series"), pk("action"), u32("index"), pk("owner"), pk("bond_ata"),
		u64("units"), u64("gross"), u64("tax"), u64("net"), u64("principal"), u64("slot"), i64("timestamp")},
	"SnapshotFinalized": {pk("series"), pk("action"), u32("index"), u64("units_snapshotted"), u32("holders_snapshotted"),
		u64("total_gross"), u64("total_tax"), u64("total_net"), arr("snapshot_hash", 32), u8("status"), u64("slot"), i64("timestamp")},
	"ActionFunded": {pk("series"), pk("action"), u32("index"), pk("funder"), u64("amount"), u64("escrow_balance"),
		u64("required"), boolean("fully_funded"), u64("slot"), i64("timestamp")},
	"EntitlementPaid": {pk("series"), pk("action"), u32("index"), pk("owner"), pk("cash_ata"),
		u64("units"), u64("gross"), u64("tax"), u64("net"), u64("principal"), u64("paid"), u64("slot"), i64("timestamp")},
	"ActionCompleted": {pk("series"), pk("action"), u32("index"), u8("kind"), u8("status"), u32("holders_paid"),
		u64("total_paid"), i64("next_coupon_date"), u64("slot"), i64("timestamp")},
	"UnitsRetired": {pk("series"), pk("action"), u32("index"), pk("owner"), u64("units"), u64("total_retired"), u64("slot"), i64("timestamp")},
	"SeriesClosed": {pk("series"), pk("mint"), pk("action"), u32("index"), u64("total_retired"), u64("slot"), i64("timestamp")},
	"VoteCast":     {pk("series"), pk("action"), u32("index"), pk("owner"), u8("choice"), u64("weight"), u64("slot"), i64("timestamp")},
	"MeetingFinalized": {pk("series"), pk("action"), u32("index"), u64("votes_for"), u64("votes_against"),
		u64("votes_abstain"), u64("units_snapshotted"), u8("result"), u64("slot"), i64("timestamp")},
	"TermsChanged": {pk("series"), pk("action"), u32("index"), u32("old_rate_bps"), u32("new_rate_bps"),
		i64("old_maturity"), i64("new_maturity"), boolean("regulator_registration_simulated"), u64("slot"), i64("timestamp")},
}

// EventNames lists every known event, sorted (for tests and docs).
var EventNames = func() []string {
	names := make([]string, 0, len(layouts))
	for name := range layouts {
		names = append(names, name)
	}
	slices.Sort(names)
	return names
}()

// discs maps the 8-byte Anchor event discriminator to the event name.
var discs = func() map[[8]byte]string {
	m := make(map[[8]byte]string, len(layouts))
	for name := range layouts {
		h := sha256.Sum256([]byte("event:" + name))
		m[[8]byte(h[:8])] = name
	}
	return m
}()

// Event is a decoded Anchor event. Fields is the Borsh payload keyed by the
// Rust field name; pubkeys are base58 strings, fixed byte arrays are strings
// (trailing NULs trimmed when printable, else base64).
type Event struct {
	Name   string
	Fields map[string]any
}

// decodeEvent parses one raw `Program data:` payload (discriminator + Borsh body).
func decodeEvent(raw []byte) (Event, error) {
	if len(raw) < 8 {
		return Event{}, fmt.Errorf("event payload too short: %d bytes", len(raw))
	}
	var disc [8]byte
	copy(disc[:], raw)
	name, ok := discs[disc]
	if !ok {
		return Event{}, fmt.Errorf("unknown event discriminator %x", disc)
	}
	body := raw[8:]
	pos := 0
	ev := Event{Name: name, Fields: make(map[string]any, len(layouts[name]))}
	for _, f := range layouts[name] {
		need := map[string]int{"pk": 32, "u8": 1, "u16": 2, "u32": 4, "u64": 8, "i64": 8, "bool": 1, "bytes": f.n}[f.kind]
		if pos+need > len(body) {
			return Event{}, fmt.Errorf("event %s: field %s needs %d bytes at offset %d, %d left", name, f.name, need, pos, len(body)-pos)
		}
		chunk := body[pos : pos+need]
		switch f.kind {
		case "pk":
			ev.Fields[f.name] = solana.PublicKeyFromBytes(chunk).String()
		case "u8":
			ev.Fields[f.name] = chunk[0]
		case "u16":
			ev.Fields[f.name] = binary.LittleEndian.Uint16(chunk)
		case "u32":
			ev.Fields[f.name] = binary.LittleEndian.Uint32(chunk)
		case "u64":
			// decimal string: JS loses integer precision above 2^53, and u64
			// amounts/units must survive the JSON payload to the browser
			ev.Fields[f.name] = strconv.FormatUint(binary.LittleEndian.Uint64(chunk), 10)
		case "i64":
			ev.Fields[f.name] = int64(binary.LittleEndian.Uint64(chunk))
		case "bool":
			ev.Fields[f.name] = chunk[0] != 0
		case "bytes":
			ev.Fields[f.name] = byteStr(chunk)
		}
		pos += need
	}
	if pos != len(body) {
		return Event{}, fmt.Errorf("event %s: %d trailing bytes", name, len(body)-pos)
	}
	return ev, nil
}

// byteStr renders fixed byte arrays: printable ASCII with trailing NULs
// trimmed (ISIN, ticker), base64 otherwise (hashes, opaque refs).
func byteStr(b []byte) string {
	trimmed := make([]byte, 0, len(b))
	for _, c := range b {
		if c == 0 {
			break
		}
		if c < 0x20 || c > 0x7e {
			return base64.StdEncoding.EncodeToString(b)
		}
		trimmed = append(trimmed, c)
	}
	return string(trimmed)
}

const programDataPrefix = "Program data: "

// ParseLogs extracts every decodable Anchor event from a transaction's log
// messages, in log order. Unknown discriminators and non-event lines are
// skipped (forward compatibility with newer program builds); decode failures
// on known events are logged, never dropped silently.
func ParseLogs(logs []string) []Event {
	var out []Event
	for _, line := range logs {
		if !strings.HasPrefix(line, programDataPrefix) {
			continue
		}
		raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(line, programDataPrefix))
		if err != nil {
			slog.Warn("ingest: bad event log encoding", "err", err)
			continue
		}
		ev, err := decodeEvent(raw)
		if err != nil {
			// err carries the event name when the discriminator is known
			slog.Warn("ingest: event decode failed", "err", err)
			continue
		}
		out = append(out, ev)
	}
	return out
}
