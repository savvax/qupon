package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// showcaseRead serves three series: the first showcase series, a judge sandbox on the demo clock,
// and the plain demo bond on the real clock.
type showcaseRead struct{ fakeRead }

func (showcaseRead) AllSeries(context.Context) ([]chain.SeriesRecord, error) {
	mk := func(mint solana.PublicKey, isin, ticker string, daySecs uint32) chain.SeriesRecord {
		s := (&fakeRead{}).series()
		s.Mint = mint
		copy(s.ISIN[:], isin)
		copy(s.Ticker[:], ticker)
		s.DaySecs = daySecs
		return chain.SeriesRecord{PDA: fSeries, Series: s}
	}
	return []chain.SeriesRecord{
		mk(solana.PublicKey{1: 1}, "KZ2C0QPN0018", "Almaty Power", 4),  // showcase coupon
		mk(solana.PublicKey{2: 2}, "KZ2C0SBX0099", "Judge sandbox", 2), // demo clock, not curated
		mk(solana.PublicKey{3: 3}, "KZ2C0QUPON01", "QPNb1", 0),         // real clock: stays public
		mk(solana.PublicKey{4: 4}, "KZ2C0QUPON02", "QPNb2", 0),         // second real-clock series
	}, nil
}

func TestValidISIN(t *testing.T) {
	for _, d := range Showcase {
		if !ValidISIN(d.ISIN) {
			t.Errorf("showcase ISIN %s fails its Luhn check digit", d.ISIN)
		}
	}
	for _, c := range []struct {
		isin string
		want bool
	}{
		{"US0378331005", false}, // well-formed but not a KZ2C0QPN issue
		{"KZ2C0QPN0019", false}, // wrong check digit (correct is 8)
		{"KZ2C0QPN001", false},  // too short
		{"KZ2C0QPN001X", false}, // non-digit tail
	} {
		if got := ValidISIN(c.isin); got != c.want {
			t.Errorf("ValidISIN(%q) = %v, want %v", c.isin, got, c.want)
		}
	}
	// A real-world ISIN's check digit, computed the same way.
	if got := IsinCheckDigit("US037833100"); got != 5 {
		t.Errorf("IsinCheckDigit(Apple base) = %d, want 5", got)
	}
}

func TestShowcaseSeedFeaturesAndHides(t *testing.T) {
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "showcase.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(5, time.Minute)}
	h := New(slog.New(slog.DiscardHandler), st, Deps{Auth: svc, Read: showcaseRead{}})
	admin := signIn(t, h, st, svc, "admin")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/admin/showcase/seed", nil)
	req.Header.Set("Authorization", "Bearer "+admin)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("seed = %d %s", rec.Code, rec.Body)
	}
	var out struct {
		Seeded  []string `json:"seeded"`
		Hidden  []string `json:"hidden"`
		Missing []string `json:"missing"`
	}
	if json.Unmarshal(rec.Body.Bytes(), &out) != nil || len(out.Seeded) != 1 ||
		len(out.Hidden) != 1 || len(out.Missing) != 3 {
		t.Fatalf("seed result = %s", rec.Body)
	}

	// Public board: the sandbox is gone, the showcase series is featured, the real-clock demo stays.
	var board []struct {
		Mint     string `json:"mint"`
		Featured bool   `json:"featured"`
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/series", nil))
	if json.Unmarshal(rec.Body.Bytes(), &board) != nil || len(board) != 3 {
		t.Fatalf("board after seed = %s", rec.Body)
	}
	showcase, sandbox, real1, real2 := solana.PublicKey{1: 1}.String(), solana.PublicKey{2: 2}.String(),
		solana.PublicKey{3: 3}.String(), solana.PublicKey{4: 4}.String()
	if !board[0].Featured || board[0].Mint != showcase {
		t.Fatalf("featured series is not first: %s", rec.Body)
	}
	// The two non-featured series keep their AllSeries order (the comparator returns 0 for them).
	if board[1].Mint != real1 || board[2].Mint != real2 {
		t.Fatalf("non-featured series reordered: %s", rec.Body)
	}
	for _, s := range board {
		if s.Mint == sandbox {
			t.Fatalf("sandbox still public: %s", rec.Body)
		}
	}

	// Seeding again is idempotent and an admin-curated series is never hidden.
	if err := st.UpsertSeriesSettings(t.Context(), store.SeriesSettings{SeriesMint: sandbox, Featured: true}); err != nil {
		t.Fatal(err)
	}
	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/admin/showcase/seed", nil)
	req.Header.Set("Authorization", "Bearer "+admin)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("re-seed = %d %s", rec.Code, rec.Body)
	}
	set, err := st.GetSeriesSettings(t.Context(), sandbox)
	if err != nil || set.Hidden || !set.Featured {
		t.Fatalf("curated sandbox must stay public: %+v %v", set, err)
	}
}

func TestShowcaseSeedAnswersUnauthorized(t *testing.T) {
	h, _, _ := newAuthServer(t, false)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/admin/showcase/seed", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauth seed = %d, want 401", rec.Code)
	}
}
