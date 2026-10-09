package ingest

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// recorded tx log lines (three txs, four events, one unknown discriminator)
func fixtureLogs(t *testing.T) []string {
	t.Helper()
	body, err := os.ReadFile("testdata/tx_logs.txt")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	return strings.Split(strings.TrimRight(string(body), "\n"), "\n")
}

const (
	fixSeries = "sKs7mQPZ9avjLQeitAckaLJdEZeGUjt8TzWjFXgJ6wc"
	fixOwner  = "2WTDzxPkJxrs7omRFRk57voHUHS6TAspESEWezgU4Zyb"
	fixAction = "2arWonJz1HgfANm4vhmG656j9B3vu84id4Eh3B3GSqPP"
)

func TestParseLogsFixture(t *testing.T) {
	events := ParseLogs(fixtureLogs(t))
	wantKinds := []string{"SeriesInitialized", "Subscribed", "ActionFunded", "HolderSnapshotted"}
	if len(events) != len(wantKinds) {
		t.Fatalf("got %d events, want %d (unknown discriminator must be skipped)", len(events), len(wantKinds))
	}
	for i, want := range wantKinds {
		if events[i].Name != want {
			t.Errorf("event[%d] = %s, want %s", i, events[i].Name, want)
		}
	}

	t.Run("SeriesInitialized", func(t *testing.T) {
		f := events[0].Fields
		checks := map[string]any{
			"series":          fixSeries,
			"ticker":          "QUPN01",
			"face_value":      "1000", // u64 fields decode to decimal strings
			"coupon_rate_bps": uint32(1000),
			"frequency":       byte(2),
			"slot":            "310",
			"timestamp":       int64(1767230000),
		}
		if got := f["isin"]; got != "KZ1P01DE06A1" {
			t.Errorf("isin = %q, want %q", got, "KZ1P01DE06A1")
		}
		for k, want := range checks {
			if k == "isin" {
				continue
			}
			if got := f[k]; got != want {
				t.Errorf("%s = %#v, want %#v", k, got, want)
			}
		}
	})

	t.Run("Subscribed uses brief numbers", func(t *testing.T) {
		f := events[1].Fields
		for k, want := range map[string]any{
			"owner": fixOwner, "units": "10", "price_per_unit": "1000",
			"cash_paid": "10000", "total_issued": "10",
		} {
			if got := f[k]; got != want {
				t.Errorf("%s = %#v, want %#v", k, got, want)
			}
		}
	})

	t.Run("u64 amounts serialize as JSON strings", func(t *testing.T) {
		b, err := json.Marshal(events[1].Fields)
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		// JS loses integer precision above 2^53; amounts must be strings
		if !strings.Contains(string(b), `"cash_paid":"10000"`) {
			t.Errorf("payload = %s, want cash_paid as decimal string", b)
		}
	})

	t.Run("ActionFunded", func(t *testing.T) {
		f := events[2].Fields
		if got := f["fully_funded"]; got != true {
			t.Errorf("fully_funded = %#v, want true", got)
		}
		if got := f["amount"]; got != "5000" {
			t.Errorf("amount = %#v, want 5000", got)
		}
		if got := f["action"]; got != fixAction {
			t.Errorf("action = %v, want %s", got, fixAction)
		}
	})

	t.Run("HolderSnapshotted rounding vectors", func(t *testing.T) {
		f := events[3].Fields
		for k, want := range map[string]any{
			"units": "25", "gross": "1250", "tax": "125", "net": "1125",
		} {
			if got := f[k]; got != want {
				t.Errorf("%s = %#v, want %#v", k, got, want)
			}
		}
	})
}

func TestDecodeEventErrors(t *testing.T) {
	h := sha256.Sum256([]byte("event:SeriesInitialized"))
	disc := h[:8]
	tests := []struct {
		name string
		raw  []byte
	}{
		{"too short", disc[:5]},
		{"unknown disc", bytes.Repeat([]byte{7}, 16)},
		{"truncated body", disc[:20]},                                               // SeriesInitialized needs ~200 bytes
		{"trailing bytes", append(append([]byte{}, disc...), make([]byte, 300)...)}, // more than the layout needs
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := decodeEvent(tc.raw); err == nil {
				t.Fatal("decodeEvent succeeded, want error")
			}
		})
	}
}

func TestLayoutsCoverAllEvents(t *testing.T) {
	if len(EventNames) != 28 {
		t.Fatalf("known events = %d, want 28 (events.rs count): %v", len(EventNames), EventNames)
	}
}
