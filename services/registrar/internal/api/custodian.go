// Wrapped digital tenge custodian (platform v2 §5.1, task 606) — SIMULATED.
// The real digital tenge is a CBDC on the National Bank's private platform; on
// Solana it can only exist as a custodian-wrapped token (dKZT, kind
// wrapped_cbdc). This surface lets an admin record a (SIMULATED) CBDC deposit
// reference + amount and mint dKZT to an issuer treasury, or burn it back on
// withdrawal — every movement runs through the qupon CLI executor and is
// audited; the ledger below is those audit rows.

package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"unicode"

	"github.com/go-chi/chi/v5"
	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// custodianAmountMax bounds one movement in major units (sanity for a SIMULATED mint).
const custodianAmountMax = 1_000_000_000

// custodianTestAsset returns the wrapped_cbdc test asset of this network (dKZT);
// ok=false when the network has none configured.
func custodianTestAsset(baseConfig string) (testAssetEntry, bool) {
	raw, err := os.ReadFile(baseConfig)
	if err != nil {
		return testAssetEntry{}, false
	}
	var cfg struct {
		TestAssets []testAssetEntry `json:"testAssets"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return testAssetEntry{}, false
	}
	for _, a := range cfg.TestAssets {
		if a.Kind == "wrapped_cbdc" {
			return a, true
		}
	}
	return testAssetEntry{}, false
}

// custodianParams is the audit-row payload of one movement; the ledger read parses it back.
type custodianParams struct {
	Kind      string `json:"kind"` // deposit | withdraw
	Reference string `json:"reference"`
	Amount    uint64 `json:"amount"` // minor units
	To        string `json:"to,omitempty"`
}

// custodianEntry is one ledger row (a custodian audit row with params resolved).
type custodianEntry struct {
	ID        int64  `json:"id"`
	Ts        int64  `json:"ts"`
	Kind      string `json:"kind"` // deposit | withdraw
	Reference string `json:"reference"`
	Amount    uint64 `json:"amount"` // minor units
	To        string `json:"to,omitempty"`
	Email     string `json:"email"`
	OK        bool   `json:"ok"`
	Detail    string `json:"detail"`
	Signature string `json:"signature,omitempty"`
}

func mountCustodian(r chi.Router, deps Deps, st *store.Store) {
	admin := requireRole(deps.Auth, "admin")
	r.With(admin).Get("/admin/custodian", custodianStatus(deps, st))
	r.With(admin).Post("/admin/custodian/deposit", custodianMove(deps, st, "deposit"))
	r.With(admin).Post("/admin/custodian/withdraw", custodianMove(deps, st, "withdraw"))
}

// custodianStatus serves the page read: the wrapped asset + the ledger (audit rows).
func custodianStatus(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var asset *testAssetEntry
		if a, ok := custodianTestAsset(deps.BaseConfig); ok {
			asset = &a
		}
		rows, err := st.SearchAudit(r.Context(), store.AuditFilter{Route: "custodian", Limit: 100})
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		ledger := make([]custodianEntry, 0, len(rows))
		for _, row := range rows {
			e := custodianEntry{
				ID: row.ID, Ts: row.Ts, Email: row.Email, OK: row.OK, Detail: row.Detail,
				Kind: "deposit", // a custodian route is deposit or withdraw; deposit is the safe default
			}
			var p custodianParams
			if err := json.Unmarshal(row.Params, &p); err == nil {
				if p.Kind != "" {
					e.Kind = p.Kind
				}
				e.Reference, e.Amount, e.To = p.Reference, p.Amount, p.To
			}
			if len(row.Signatures) > 0 {
				e.Signature = row.Signatures[0]
			}
			ledger = append(ledger, e)
		}
		writeJSON(w, http.StatusOK, map[string]any{"asset": asset, "ledger": ledger})
	}
}

// custodianMove is POST /admin/custodian/{deposit,withdraw} (SIMULATED): record the
// CBDC reference and mint (deposit) or burn (withdraw) dKZT through the executor.
func custodianMove(deps Deps, st *store.Store, kind string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Network.Mainnet {
			writeErrorCode(w, http.StatusForbidden, "mainnet", "the custodian exists only on test networks")
			return
		}
		var req struct {
			Reference string `json:"reference"`
			Amount    uint64 `json:"amount"` // major units
			To        string `json:"to"`     // treasury owner (deposit only)
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		reference := strings.TrimSpace(req.Reference)
		if len(reference) < 1 || len(reference) > 80 || strings.ContainsFunc(reference, unicode.IsControl) {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "reference must be 1–80 printable characters")
			return
		}
		if req.Amount < 1 || req.Amount > custodianAmountMax {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params",
				fmt.Sprintf("amount must be 1–%d major units", custodianAmountMax))
			return
		}
		var to string
		if kind == "deposit" {
			owner, err := solana.PublicKeyFromBase58(strings.TrimSpace(req.To))
			if err != nil {
				writeErrorCode(w, http.StatusBadRequest, "invalid_params", "to must be a base58 treasury address")
				return
			}
			to = owner.String()
		}
		asset, ok := custodianTestAsset(deps.BaseConfig)
		if !ok {
			writeErrorCode(w, http.StatusNotFound, "asset_not_found", "no wrapped_cbdc asset is configured for this network")
			return
		}
		if asset.Decimals < 0 || asset.Decimals > 9 {
			writeError(w, http.StatusInternalServerError, "wrapped asset decimals are misconfigured")
			return
		}
		minor := req.Amount
		for range asset.Decimals {
			minor *= 10
		}
		if deps.Executor == nil {
			writeError(w, http.StatusServiceUnavailable, "executor not configured (set QUPON_CLI)")
			return
		}
		params := custodianParams{Kind: kind, Reference: reference, Amount: minor}
		args := []string{"asset:burn", "--mint", asset.Mint, "--amount", strconv.FormatUint(minor, 10), "--memo", reference}
		detail := "SIMULATED custodian withdrawal: " + asset.Symbol + " burned"
		if kind == "deposit" {
			args = []string{"asset:mint", "--mint", asset.Mint, "--to", to, "--amount", strconv.FormatUint(minor, 10), "--memo", reference}
			detail = "SIMULATED custodian deposit: " + asset.Symbol + " minted"
			params.To = to
		}
		res, err := deps.Executor.Run(r.Context(), args...)
		if err != nil {
			writeError(w, http.StatusGatewayTimeout, err.Error())
			return
		}
		if !res.OK {
			audit(st, r, params, false, "SIMULATED custodian "+kind+" failed: "+res.Error, nil)
			writeError(w, http.StatusConflict, res.Error)
			return
		}
		audit(st, r, params, true, detail, []string{res.Signature})
		writeJSON(w, http.StatusOK, map[string]any{
			"ok": true, "kind": kind, "reference": reference, "amount": minor,
			"signature": res.Signature, "explorerUrl": txExplorer(res.Signature),
		})
	}
}
