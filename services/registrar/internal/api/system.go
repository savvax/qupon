// System health (task 702, spec §5.2): GET /admin/system reports RPC liveness, operator SOL
// balances, executor queue depth, scheduler state, ingest lag, kase.kz cache status and demo
// usage. Read-only, so nothing is audited. RPC errors are never echoed: solana-go includes the
// request URL in its errors and the endpoint may be keyed — a failed probe is just ok:false.
package api

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/network"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// SystemChain is the RPC surface /admin/system probes; satisfied by *chain.Client.
type SystemChain interface {
	Slot(ctx context.Context) (uint64, error)
	Balance(ctx context.Context, key solana.PublicKey) (uint64, error)
}

// SystemScheduler reports scheduler liveness; satisfied by *scheduler.Scheduler.
type SystemScheduler interface{ LastTick() time.Time }

// SystemIngest reports ingest progress; satisfied by *ingest.Poller.
type SystemIngest interface{ LastSlot() uint64 }

const (
	rpcProbeTimeout = 2 * time.Second // spec §5.2: RPC probe with a 2 s timeout
	lowSolThreshold = 0.5             // operator low-balance warning (spec §5.2)
)

type rpcHealth struct {
	OK        bool   `json:"ok"`
	LatencyMs int64  `json:"latencyMs"`
	Slot      uint64 `json:"slot"`
}

type operatorHealth struct {
	Name    string  `json:"name"`
	Address string  `json:"address"`
	Sol     float64 `json:"sol"`
	Low     bool    `json:"low"`
}

type executorHealth struct {
	Running       int `json:"running"`
	Queued        int `json:"queued"`
	MaxConcurrent int `json:"maxConcurrent"`
}

type schedulerHealth struct {
	Enabled  bool   `json:"enabled"`
	LastTick string `json:"lastTick,omitempty"` // RFC3339, "" before the first tick
}

type ingestHealth struct {
	LastSlot uint64 `json:"lastSlot"`
	LagSlots uint64 `json:"lagSlots"`
}

type kaseHealth struct {
	Entries   int64  `json:"entries"`
	LastFetch string `json:"lastFetch,omitempty"` // RFC3339, "" when the cache is empty
	LastError string `json:"lastError,omitempty"`
}

type systemHealthView struct {
	Network   string           `json:"network"`
	RPC       rpcHealth        `json:"rpc"`
	Operators []operatorHealth `json:"operators"`
	Executor  executorHealth   `json:"executor"`
	Scheduler schedulerHealth  `json:"scheduler"`
	Ingest    ingestHealth     `json:"ingest"`
	Kase      kaseHealth       `json:"kase"`
	Demo      store.DemoUsage  `json:"demo"`
}

func mountSystem(r chi.Router, deps Deps, st *store.Store) {
	r.With(requireRole(deps.Auth, "admin")).Get("/admin/system", systemHealth(deps, st))
}

func systemHealth(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// One 2 s budget for every RPC call in this response: a slow node fails fast
		// instead of multiplying the delay across the operator balances.
		probeCtx, cancel := context.WithTimeout(r.Context(), rpcProbeTimeout)
		defer cancel()

		p := deps.Network
		if p.Name == "" {
			p, _ = network.New("devnet", "")
		}
		out := systemHealthView{
			Network:   p.Name,
			Operators: []operatorHealth{},
			Executor:  executorHealth{MaxConcurrent: executor.MaxConcurrent},
		}
		if deps.Executor != nil {
			out.Executor.Running, out.Executor.Queued = deps.Executor.Stats()
		}
		out.Scheduler.Enabled = deps.SystemScheduler != nil
		if deps.SystemScheduler != nil {
			if lt := deps.SystemScheduler.LastTick(); !lt.IsZero() {
				out.Scheduler.LastTick = lt.UTC().Format(time.RFC3339)
			}
		}
		if deps.SystemIngest != nil {
			out.Ingest.LastSlot = deps.SystemIngest.LastSlot()
		}

		start := time.Now()
		if deps.SystemChain != nil {
			if slot, err := deps.SystemChain.Slot(probeCtx); err == nil {
				out.RPC = rpcHealth{OK: true, LatencyMs: time.Since(start).Milliseconds(), Slot: slot}
				if out.Ingest.LastSlot > 0 && slot >= out.Ingest.LastSlot {
					out.Ingest.LagSlots = slot - out.Ingest.LastSlot
				}
				out.Operators = probeOperators(probeCtx, deps.SystemChain, deps.BaseConfig)
			}
		}
		out.RPC.LatencyMs = time.Since(start).Milliseconds()

		ks, err := st.KaseStats(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "system stats unavailable")
			return
		}
		out.Kase = kaseHealth{Entries: ks.Entries, LastError: ks.LastError}
		if ks.LastFetch != nil {
			out.Kase.LastFetch = time.Unix(*ks.LastFetch, 0).UTC().Format(time.RFC3339)
		}
		if out.Demo, err = st.DemoUsage(r.Context(), time.Now()); err != nil {
			writeError(w, http.StatusInternalServerError, "system stats unavailable")
			return
		}
		writeJSON(w, http.StatusOK, out)
	}
}

// probeOperators reads the operator wallets from the base config and fetches their balances.
// A balance that cannot be read reports sol 0 / low — never silently healthy.
func probeOperators(ctx context.Context, c SystemChain, baseConfig string) []operatorHealth {
	ops := loadOperators(baseConfig)
	out := make([]operatorHealth, 0, len(ops))
	for _, op := range ops {
		o := operatorHealth{Name: op.name, Address: op.key.String(), Low: true}
		if lamports, err := c.Balance(ctx, op.key); err == nil {
			o.Sol = float64(lamports) / 1e9
			o.Low = o.Sol < lowSolThreshold
		}
		out = append(out, o)
	}
	return out
}

type operatorKey struct {
	name string
	key  solana.PublicKey
}

// loadOperators resolves the registrar/issuer/paying-agent wallets from the base config
// (config/devnet.json "wallets"); unreadable or invalid entries are skipped. Read per call so
// config edits apply without a restart (same policy as executor.SeriesName).
func loadOperators(baseConfig string) []operatorKey {
	if baseConfig == "" {
		return nil
	}
	raw, err := os.ReadFile(baseConfig)
	if err != nil {
		return nil
	}
	var cfg struct {
		Wallets struct {
			Registrar   string `json:"registrar"`
			Issuer      string `json:"issuer"`
			PayingAgent string `json:"payingAgent"`
		} `json:"wallets"`
	}
	if json.Unmarshal(raw, &cfg) != nil {
		return nil
	}
	out := make([]operatorKey, 0, 3)
	for _, o := range []struct{ name, addr string }{
		{"registrar", cfg.Wallets.Registrar},
		{"issuer", cfg.Wallets.Issuer},
		{"payingAgent", cfg.Wallets.PayingAgent},
	} {
		if key, err := solana.PublicKeyFromBase58(o.addr); err == nil {
			out = append(out, operatorKey{name: o.name, key: key})
		}
	}
	return out
}
