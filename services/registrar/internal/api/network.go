package api

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/qupon-kz/qupon/services/registrar/internal/network"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// ConfirmHeader carries the UI's typed confirmation of a mainnet write: its value must name the network.
const ConfirmHeader = "X-Confirm-Network"

// confirmedPrefixes are the writes that sign transactions or change what the platform accepts (issuer,
// registrar, admin); account housekeeping (/me, /org, sign-in) needs no confirmation.
var confirmedPrefixes = []string{"/issuer/", "/registrar/", "/actions/", "/approvals/", "/admin/"}

// mainnetGuard enforces the mainnet guard rails (platform v2 §5.1): demo sign-in and demo writes are refused,
// and confirmed writes must carry X-Confirm-Network: mainnet-beta. On devnet it does nothing.
func mainnetGuard(p network.Profile) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if !p.Mainnet {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			path := r.URL.Path
			if path == "/auth/demo" || strings.HasPrefix(path, "/demo/") {
				writeErrorCode(w, http.StatusForbidden, "demo_disabled", "demo accounts are off on mainnet")
				return
			}
			for _, pre := range confirmedPrefixes {
				if strings.HasPrefix(path, pre) && r.Header.Get(ConfirmHeader) != p.Name {
					writeErrorCode(w, http.StatusPreconditionRequired, "confirmation_required",
						"mainnet writes need a typed confirmation ("+ConfirmHeader+": "+p.Name+")")
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// readinessCheck is one line of the admin network checklist.
type readinessCheck struct {
	Key    string `json:"key"`
	OK     bool   `json:"ok"`
	Detail string `json:"detail,omitempty"`
}

// networkReadiness answers GET /admin/network/readiness: can this instance run on its network?
func networkReadiness(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		p := deps.Network
		if p.Name == "" {
			p, _ = network.New("devnet", "")
		}
		var checks []readinessCheck
		add := func(key string, ok bool, detail string) {
			checks = append(checks, readinessCheck{Key: key, OK: ok, Detail: detail})
		}
		var program any
		if deps.Chain == nil {
			add("rpc_reachable", false, "no chain client (PROGRAM_ID unset)")
		} else {
			ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
			ps, err := deps.Chain.ProgramStatus(ctx)
			cancel()
			add("rpc_reachable", err == nil, errDetail(err))
			if err == nil {
				program = ps
				add("program_deployed", ps.Deployed, p.ProgramID)
				add("program_executable", ps.Executable, "")
				switch {
				case !ps.Upgradeable:
					add("upgrade_authority", true, "not upgradeable")
				case ps.UpgradeAuthority == nil:
					add("upgrade_authority", true, "immutable")
				default:
					add("upgrade_authority", true, *ps.UpgradeAuthority)
				}
			}
		}
		assets, err := st.ListCashAssets(r.Context(), p.Name, true)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		symbols := make([]string, 0, len(assets))
		for _, a := range assets {
			symbols = append(symbols, a.Symbol)
		}
		add("cash_assets_enabled", len(assets) > 0, strings.Join(symbols, ", "))
		demo := deps.Auth != nil && deps.Auth.DemoLogin
		add("demo_login", !p.Mainnet || !demo, map[bool]string{true: "on", false: "off"}[demo])
		writeJSON(w, http.StatusOK, map[string]any{
			"network": p.Name, "programId": p.ProgramID, "mainnet": p.Mainnet, "program": program, "checks": checks,
		})
	}
}

func errDetail(err error) string {
	if err == nil {
		return ""
	}
	return err.Error() // chain.NewRPC keeps the API key out of URLs and errors (task 9309)
}

func mountNetworkAdmin(r chi.Router, deps Deps, st *store.Store) {
	r.With(requireRole(deps.Auth, "admin")).Get("/admin/network/readiness", networkReadiness(deps, st))
}
