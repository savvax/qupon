// Devnet test-cash faucet (platform v2 §5.3, task 603): a signed-in user with a verified wallet
// can request test cash (tKZT, KZTE-dev, dKZT) through the qupon CLI executor — 100,000 major
// units, once per user per asset per hour. Test networks only: a mainnet profile gets 403 before
// anything else. The tokens go to the user's first verified wallet (store.ListWallets, task 801).

package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// faucetAmountMajor is the per-request amount in major units (spec §5.3).
const faucetAmountMajor = 100_000

// faucetKinds are the cash-asset kinds the faucet may mint (never `spl`: a real token is not test cash).
var faucetKinds = map[string]bool{"test": true, "stablecoin": true, "wrapped_cbdc": true}

// testAssetEntry mirrors config/devnet.json `testAssets` (written by scripts/create-test-asset.ts).
type testAssetEntry struct {
	Symbol   string `json:"symbol"`
	Mint     string `json:"mint"`
	Decimals int    `json:"decimals"`
	Kind     string `json:"kind"`
}

// faucetTestAsset finds the testAssets entry for a mint in the base config; ok=false when absent.
func faucetTestAsset(baseConfig, mint string) (testAssetEntry, bool) {
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
		if a.Mint == mint {
			return a, true
		}
	}
	return testAssetEntry{}, false
}

func mountFaucet(r chi.Router, deps Deps, st *store.Store) {
	perHour := auth.NewLimiter(1, time.Hour)
	r.With(requireUser(deps.Auth)).Post("/me/faucet", func(w http.ResponseWriter, r *http.Request) {
		if deps.Network.Mainnet {
			writeErrorCode(w, http.StatusForbidden, "mainnet", "the faucet exists only on test networks")
			return
		}
		var req struct {
			Mint string `json:"mint"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		mint, err := solana.PublicKeyFromBase58(strings.TrimSpace(req.Mint))
		if err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "mint must be a base58 address")
			return
		}
		asset, ok := faucetTestAsset(deps.BaseConfig, mint.String())
		if !ok {
			writeErrorCode(w, http.StatusNotFound, "asset_not_found", "mint is not a test asset of this network")
			return
		}
		if !faucetKinds[asset.Kind] {
			writeErrorCode(w, http.StatusBadRequest, "not_a_test_asset", "kind "+asset.Kind+" cannot be faucet-minted")
			return
		}
		u, _ := auth.UserFrom(r.Context())
		wallets, err := st.ListWallets(r.Context(), u.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if len(wallets) == 0 {
			writeErrorCode(w, http.StatusBadRequest, "wallet_not_linked",
				"link a wallet to your account first — the faucet pays your first verified wallet")
			return
		}
		owner := wallets[0].Address
		key := fmt.Sprintf("faucet:%d:%s", u.ID, mint)
		if perHour.Blocked(key, time.Now()) {
			writeErrorCode(w, http.StatusTooManyRequests, "rate_limited", "one faucet request per asset per hour")
			return
		}
		if deps.Executor == nil {
			writeError(w, http.StatusServiceUnavailable, "executor not configured (set QUPON_CLI)")
			return
		}
		amount := uint64(faucetAmountMajor)
		for range asset.Decimals {
			amount *= 10
		}
		res, err := deps.Executor.Run(r.Context(), "asset:faucet",
			"--mint", mint.String(), "--to", owner, "--amount", strconv.FormatUint(amount, 10))
		if err != nil {
			writeError(w, http.StatusGatewayTimeout, err.Error())
			return
		}
		if !res.OK {
			audit(st, r, req, false, "faucet failed: "+res.Error, nil)
			writeError(w, http.StatusConflict, res.Error)
			return
		}
		perHour.Hit(key, time.Now())
		audit(st, r, map[string]string{"mint": mint.String(), "symbol": asset.Symbol, "to": owner},
			true, "test cash minted", []string{res.Signature})
		writeJSON(w, http.StatusOK, map[string]any{
			"ok": true, "symbol": asset.Symbol, "amount": amount,
			"signature": res.Signature, "ata": res.Ata, "explorerUrl": txExplorer(res.Signature),
		})
	})
}
