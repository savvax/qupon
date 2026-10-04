package ingest

import (
	"bytes"
	"crypto/sha256"
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
			"face_value":      uint64(1000),
			"coupon_rate_bps": uint32(1000),
			"frequency":       byte(2),
			"slot":            uint64(310),
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
			"owner": fixOwner, "units": uint64(10), "price_per_unit": uint64(1000),
			"cash_paid": uint64(10000), "total_issued": uint64(10),
		} {
			if got := f[k]; got != want {
				t.Errorf("%s = %#v, want %#v", k, got, want)
			}
		}
	})

	t.Run("ActionFunded", func(t *testing.T) {
		f := events[2].Fields
		if got := f["fully_funded"]; got != true {
			t.Errorf("fully_funded = %#v, want true", got)
		}
		if got := f["amount"]; got != uint64(5000) {
			t.Errorf("amount = %#v, want 5000", got)
		}
		if got := f["action"]; got != fixAction {
			t.Errorf("action = %v, want %s", got, fixAction)
		}
	})

	t.Run("HolderSnapshotted rounding vectors", func(t *testing.T) {
		f := events[3].Fields
		for k, want := range map[string]any{
			"units": uint64(25), "gross": uint64(1250), "tax": uint64(125), "net": uint64(1125),
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
	if len(EventNames) != 18 {
		t.Fatalf("known events = %d, want 18 (events.rs count): %v", len(EventNames), EventNames)
	}
}
