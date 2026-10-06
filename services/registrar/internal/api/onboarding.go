// Investor onboarding checklist (platform v2 §5.3, task 808): GET /me/onboarding answers the
// checklist rows for a signed-in user — wallet linked, KYC approved, faucet used, subscribed —
// plus the faucet-eligible assets of this network: the testAssets allow-list (config) joined
// with the enabled cash-asset registry. The buttons themselves write through task 603's
// POST /me/faucet; this route is a read and audits nothing.

package api

import (
	"encoding/json"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// onboardingFaucetAsset is one faucet button of the checklist.
type onboardingFaucetAsset struct {
	Mint     string `json:"mint"`
	Symbol   string `json:"symbol"`
	Name     string `json:"name"`
	Decimals int    `json:"decimals"`
	Kind     string `json:"kind"`
}

// onboardingFaucetAssets lists the faucet-eligible assets of this network in config order:
// every testAssets entry (kinds test/stablecoin/wrapped_cbdc only) that is also an enabled
// registry asset. Mainnet has no test assets, so the list is empty there.
func onboardingFaucetAssets(r *http.Request, deps Deps, st *store.Store) ([]onboardingFaucetAsset, error) {
	out := []onboardingFaucetAsset{}
	if deps.Network.Mainnet {
		return out, nil
	}
	registry, err := st.ListCashAssets(r.Context(), deps.Network.Name, true)
	if err != nil {
		return nil, err
	}
	byMint := make(map[string]store.CashAsset, len(registry))
	for _, a := range registry {
		byMint[a.Mint] = a
	}
	raw, err := os.ReadFile(deps.BaseConfig)
	if err != nil {
		return out, nil // no base config → no test assets, not a failure
	}
	var cfg struct {
		TestAssets []testAssetEntry `json:"testAssets"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return out, nil
	}
	for _, ta := range cfg.TestAssets {
		if !faucetKinds[ta.Kind] {
			continue
		}
		if a, ok := byMint[ta.Mint]; ok {
			out = append(out, onboardingFaucetAsset{
				Mint: a.Mint, Symbol: a.Symbol, Name: a.Name, Decimals: a.Decimals, Kind: a.Kind,
			})
		}
	}
	return out, nil
}

func mountOnboarding(r chi.Router, deps Deps, st *store.Store) {
	r.With(requireUser(deps.Auth)).Get("/me/onboarding", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		wallets, err := st.ListWallets(r.Context(), u.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		owners := make([]string, len(wallets))
		for i, w := range wallets {
			owners[i] = w.Address
		}
		kycApproved := false
		if app, err := st.LatestKyc(r.Context(), u.ID); err == nil {
			kycApproved = app.Status == "approved"
		}
		testCash, err := st.FaucetUsed(r.Context(), u.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		subscribed, err := st.OwnersSubscribed(r.Context(), owners)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		assets, err := onboardingFaucetAssets(r, deps, st)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"checklist": map[string]bool{
				"account":          true, // reached only with a session
				"walletLinked":     len(wallets) > 0,
				"kycApproved":      kycApproved,
				"testCashReceived": testCash,
				"subscribed":       subscribed,
			},
			"faucetAssets": assets,
		})
	})
}
