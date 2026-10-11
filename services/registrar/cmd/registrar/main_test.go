package main

import (
	"context"
	"log/slog"
	"path/filepath"
	"testing"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/api"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// TestAutoseedShowcaseRunsImmediatelyAndStops (task 91558): the loop curates the board without
// waiting for the first tick and returns when the server context is cancelled. Uses the
// no-chain-reader fallback: mirror rows in the shape SeedShowcase parses.
func TestAutoseedShowcaseRunsImmediatelyAndStops(t *testing.T) {
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "autoseed.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })

	showcase, sandbox := "MintShowcase", "MintSandbox"
	for _, row := range []struct{ mint, data string }{
		{showcase, `{"mint":"` + showcase + `","isin":"KZ2C0QPN0018","demoClock":{"daySecs":3600}}`},
		{sandbox, `{"mint":"` + sandbox + `","isin":"KZ2C0SBX0099","demoClock":{"daySecs":2}}`},
	} {
		if err := st.UpsertSeries(t.Context(), row.mint, []byte(row.data)); err != nil {
			t.Fatal(err)
		}
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	// One hour between ticks: anything that gets curated proves the first pass ran immediately.
	go func() {
		autoseedShowcase(ctx, api.Deps{}, st, slog.New(slog.DiscardHandler), time.Hour)
		close(done)
	}()

	deadline := time.Now().Add(5 * time.Second)
	for {
		set, err := st.GetSeriesSettings(context.Background(), showcase)
		if err == nil && set.Featured && !set.Hidden {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("showcase series not featured immediately: %+v (%v)", set, err)
		}
		time.Sleep(5 * time.Millisecond)
	}
	if set, err := st.GetSeriesSettings(context.Background(), sandbox); err != nil || !set.Hidden {
		t.Fatalf("uncurated sandbox not hidden: %+v (%v)", set, err)
	}

	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("autoseed loop did not stop on context cancel")
	}
}
