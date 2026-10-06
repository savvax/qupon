package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// fakeSystemChain plays the RPC probe surface: delay simulates a slow node
// (every call honors the caller's context so the 2 s probe budget cancels it).
type fakeSystemChain struct {
	delay   time.Duration
	slot    uint64
	slotErr error
	balance map[string]uint64
}

func (f *fakeSystemChain) Slot(ctx context.Context) (uint64, error) {
	if err := waitCtx(ctx, f.delay); err != nil {
		return 0, err
	}
	return f.slot, f.slotErr
}

func (f *fakeSystemChain) Balance(ctx context.Context, key solana.PublicKey) (uint64, error) {
	if err := waitCtx(ctx, f.delay); err != nil {
		return 0, err
	}
	if v, ok := f.balance[key.String()]; ok {
		return v, nil
	}
	return 5_000_000_000, nil // default: a healthy 5 SOL
}

func waitCtx(ctx context.Context, d time.Duration) error {
	if d == 0 {
		return nil
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

type fakeScheduler struct{ tick time.Time }

func (f fakeScheduler) LastTick() time.Time { return f.tick }

type fakeIngest struct{ slot uint64 }

func (f fakeIngest) LastSlot() uint64 { return f.slot }

// baseConfigFixture writes a minimal qupon config with the devnet operator wallets.
func baseConfigFixture(t *testing.T) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "devnet.json")
	body := `{"wallets":{
		"registrar":"Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97",
		"issuer":"8zqKjKvQUmo38zTjwppjnQZdaFBf3ipZVZMhV26g3yma",
		"payingAgent":"7EiXu2LfAk6WiCE5ZfF2kc4Sk3cP9GubmQ4V9R4smijk"}}`
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func newSystemServer(t *testing.T, chain SystemChain, sched SystemScheduler, ing SystemIngest) (http.Handler, *auth.Service, *store.Store) {
	t.Helper()
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "system.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(5, time.Minute)}
	h := New(slog.New(slog.DiscardHandler), st, Deps{
		Auth:            svc,
		BaseConfig:      baseConfigFixture(t),
		SystemChain:     chain,
		SystemScheduler: sched,
		SystemIngest:    ing,
	})
	return h, svc, st
}

func TestAdminSystemHealth(t *testing.T) {
	chain := &fakeSystemChain{
		slot: 5000,
		balance: map[string]uint64{
			// registrar wallet is funded (5 SOL default); issuer is broke → low
			"8zqKjKvQUmo38zTjwppjnQZdaFBf3ipZVZMhV26g3yma": 100_000_000, // 0.1 SOL
		},
	}
	h, svc, st := newSystemServer(t, chain, fakeScheduler{tick: time.Now()}, fakeIngest{slot: 4990})
	admin := signIn(t, h, st, svc, "admin")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/admin/system", nil)
	req.Header.Set("Authorization", "Bearer "+admin)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
	var got struct {
		Network string `json:"network"`
		RPC     struct {
			OK        bool   `json:"ok"`
			LatencyMs int64  `json:"latencyMs"`
			Slot      uint64 `json:"slot"`
		} `json:"rpc"`
		Operators []struct {
			Name    string  `json:"name"`
			Address string  `json:"address"`
			Sol     float64 `json:"sol"`
			Low     bool    `json:"low"`
		} `json:"operators"`
		Executor struct {
			Running, Queued, MaxConcurrent int
		} `json:"executor"`
		Scheduler struct {
			Enabled  bool   `json:"enabled"`
			LastTick string `json:"lastTick"`
		} `json:"scheduler"`
		Ingest struct {
			LastSlot uint64 `json:"lastSlot"`
			LagSlots uint64 `json:"lagSlots"`
		} `json:"ingest"`
		Kase struct {
			Entries int64 `json:"entries"`
		} `json:"kase"`
		Demo struct {
			WritesPerHour int64 `json:"writesPerHour"`
			SeriesPerDay  int64 `json:"seriesPerDay"`
		} `json:"demo"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Network != "devnet" || !got.RPC.OK || got.RPC.Slot != 5000 {
		t.Errorf("network/rpc = %s %+v", got.Network, got.RPC)
	}
	if len(got.Operators) != 3 {
		t.Fatalf("operators = %+v, want the 3 config wallets", got.Operators)
	}
	byName := map[string]struct {
		Sol  float64
		Low  bool
		Addr string
	}{}
	for _, o := range got.Operators {
		byName[o.Name] = struct {
			Sol  float64
			Low  bool
			Addr string
		}{o.Sol, o.Low, o.Address}
	}
	if byName["registrar"].Sol != 5 || byName["registrar"].Low {
		t.Errorf("registrar = %+v, want 5 SOL not low", byName["registrar"])
	}
	if byName["issuer"].Sol != 0.1 || !byName["issuer"].Low {
		t.Errorf("issuer = %+v, want 0.1 SOL flagged low", byName["issuer"])
	}
	if !byName["payingAgent"].Low && byName["payingAgent"].Sol == 0 {
		t.Errorf("payingAgent = %+v", byName["payingAgent"])
	}
	if got.Executor.MaxConcurrent == 0 {
		t.Errorf("executor = %+v, want maxConcurrent set", got.Executor)
	}
	if !got.Scheduler.Enabled || got.Scheduler.LastTick == "" {
		t.Errorf("scheduler = %+v, want enabled with a tick", got.Scheduler)
	}
	if got.Ingest.LastSlot != 4990 || got.Ingest.LagSlots != 10 {
		t.Errorf("ingest = %+v, want lastSlot 4990 lag 10", got.Ingest)
	}
	if got.Kase.Entries != 0 || got.Demo.WritesPerHour != 0 || got.Demo.SeriesPerDay != 0 {
		t.Errorf("kase/demo = %+v %+v, want zeros on a fresh store", got.Kase, got.Demo)
	}
}

func TestAdminSystemSlowRPCFailsFast(t *testing.T) {
	chain := &fakeSystemChain{slot: 5000, delay: 30 * time.Second} // slower than the 2 s probe budget
	h, svc, st := newSystemServer(t, chain, nil, nil)
	admin := signIn(t, h, st, svc, "admin")

	start := time.Now()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/admin/system", nil)
	req.Header.Set("Authorization", "Bearer "+admin)
	h.ServeHTTP(rec, req)
	elapsed := time.Since(start)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
	var got struct {
		RPC       struct{ OK bool }      `json:"rpc"`
		Operators []struct{ Low bool }   `json:"operators"`
		Scheduler struct{ Enabled bool } `json:"scheduler"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if elapsed > 2500*time.Millisecond {
		t.Fatalf("probe took %s, want ok:false within 2.5 s", elapsed)
	}
	if got.RPC.OK {
		t.Error("rpc.ok = true, want false on a slow node")
	}
	if got.Scheduler.Enabled {
		t.Error("scheduler.enabled = true, want false when not wired")
	}
	if len(got.Operators) != 0 {
		t.Errorf("operators = %d, want none probed when RPC is down", len(got.Operators))
	}
}

func TestAdminSystemRoleGate(t *testing.T) {
	h, svc, st := newSystemServer(t, nil, nil, nil)
	issuer := signIn(t, h, st, svc, "issuer")
	if got := doGet(t, h, "/admin/system", ""); got != http.StatusUnauthorized {
		t.Errorf("anonymous = %d, want 401", got)
	}
	if got := doGet(t, h, "/admin/system", issuer); got != http.StatusForbidden {
		t.Errorf("issuer = %d, want 403", got)
	}
}
