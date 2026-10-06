// Cash-asset registry routes (platform v2 §5.1): assets are added by mint
// address, verified on-chain and stored disabled until an admin confirms the
// metadata (symbol, kind, issuer note) and enables them. Tickers can be faked
// — only the mint address identifies an asset.

package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/qupon-kz/qupon/services/registrar/internal/assets"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
	solana "github.com/solana-foundation/solana-go/v2"
)

// assetKinds mirrors the cash_assets CHECK constraint.
var assetKinds = map[string]bool{"test": true, "stablecoin": true, "wrapped_cbdc": true, "spl": true}

func mountAssets(r chi.Router, deps Deps, st *store.Store) {
	r.Get("/assets", listAssets(deps, st))
	admin := requireRole(deps.Auth, "admin")
	r.With(admin).Get("/admin/assets", listAdminAssets(deps, st))
	r.With(admin).Post("/admin/assets", addAsset(deps, st))
	r.With(admin).Patch("/admin/assets/{mint}", patchAsset(deps, st))
}

// assetNetwork is the store key of this instance's network (zero profile = devnet).
func assetNetwork(deps Deps) string {
	if deps.Network.Name != "" {
		return deps.Network.Name
	}
	return "devnet"
}

// publicAsset is the public /assets row: verified facts only, no admin metadata.
type publicAsset struct {
	Mint            string  `json:"mint"`
	Symbol          string  `json:"symbol"`
	Name            string  `json:"name"`
	Decimals        int     `json:"decimals"`
	Kind            string  `json:"kind"`
	TokenProgram    string  `json:"tokenProgram"`
	FreezeAuthority *string `json:"freezeAuthority"`
	MintAuthority   *string `json:"mintAuthority"`
}

func listAssets(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := st.ListCashAssets(r.Context(), assetNetwork(deps), true)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		out := make([]publicAsset, 0, len(rows))
		for _, a := range rows {
			out = append(out, publicAsset{Mint: a.Mint, Symbol: a.Symbol, Name: a.Name, Decimals: a.Decimals,
				Kind: a.Kind, TokenProgram: a.TokenProgram, FreezeAuthority: a.FreezeAuthority, MintAuthority: a.MintAuthority})
		}
		writeJSON(w, http.StatusOK, out)
	}
}

func listAdminAssets(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := st.ListCashAssets(r.Context(), assetNetwork(deps), false)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, rows)
	}
}

// addAsset is POST /admin/assets {mint}: verify the mint on-chain, store it
// disabled, and surface authorities / collisions as warnings — never silently
// enabled (Review Focus).
func addAsset(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Chain == nil {
			writeError(w, http.StatusServiceUnavailable, "chain reader not configured")
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
		ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
		defer cancel()
		network := assetNetwork(deps)
		if _, err := st.GetCashAsset(ctx, network, mint.String()); err == nil {
			writeErrorCode(w, http.StatusConflict, "asset_exists", "asset is already registered")
			return
		} else if !errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		info, err := assets.VerifyMint(ctx, deps.Chain, mint)
		if err != nil {
			switch {
			case errors.Is(err, assets.ErrNotMint):
				writeErrorCode(w, http.StatusBadRequest, "not_a_mint", "account "+mint.String()+" is not a mint")
			case errors.Is(err, assets.ErrUnknownProgram):
				writeErrorCode(w, http.StatusBadRequest, "unknown_token_program", err.Error())
			default:
				writeError(w, http.StatusBadGateway, err.Error())
			}
			return
		}
		now := time.Now().Unix()
		a := store.CashAsset{
			Network: network, Mint: info.Mint, Decimals: int(info.Decimals), TokenProgram: info.TokenProgram,
			Kind: "spl", MintAuthority: info.MintAuthority, FreezeAuthority: info.FreezeAuthority,
			VerifiedAt: &now, Enabled: false,
		}
		if err := st.UpsertCashAsset(ctx, a); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		warnings := assetWarnings(ctx, st, a)
		audit(st, r, req, true, "asset added (disabled, verified on-chain)", nil)
		writeJSON(w, http.StatusCreated, map[string]any{"asset": a, "warnings": warnings})
	}
}

func patchAsset(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Symbol           *string `json:"symbol"`
			Name             *string `json:"name"`
			Kind             *string `json:"kind"`
			IssuerNote       *string `json:"issuerNote"`
			Enabled          *bool   `json:"enabled"`
			AcceptFreezeAuth bool    `json:"acceptFreezeAuthority"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		if req.Kind != nil && !assetKinds[*req.Kind] {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params",
				"kind must be test, stablecoin, wrapped_cbdc or spl")
			return
		}
		mint := chi.URLParam(r, "mint")
		a, err := st.GetCashAsset(r.Context(), assetNetwork(deps), mint)
		if errors.Is(err, store.ErrNotFound) {
			writeErrorCode(w, http.StatusNotFound, "not_found", "no asset with mint "+mint)
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		// Enabling an asset whose mint can be frozen needs an explicit confirmation.
		if req.Enabled != nil && *req.Enabled && a.FreezeAuthority != nil && !req.AcceptFreezeAuth {
			writeErrorCode(w, http.StatusBadRequest, "freeze_authority_unconfirmed",
				"mint has a freeze authority — pass acceptFreezeAuthority to enable anyway")
			return
		}
		if req.Symbol != nil {
			a.Symbol = strings.TrimSpace(*req.Symbol)
		}
		if req.Name != nil {
			a.Name = *req.Name
		}
		if req.Kind != nil {
			a.Kind = *req.Kind
		}
		if req.IssuerNote != nil {
			a.IssuerNote = *req.IssuerNote
		}
		if req.Enabled != nil {
			a.Enabled = *req.Enabled
		}
		if err := st.UpsertCashAsset(r.Context(), a); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		warnings := assetWarnings(r.Context(), st, a)
		audit(st, r, req, true, "asset updated", nil)
		writeJSON(w, http.StatusOK, map[string]any{"asset": a, "warnings": warnings})
	}
}

// assetWarnings lists what the admin should double-check: live authorities and
// a symbol already used by another asset of this network.
func assetWarnings(ctx context.Context, st *store.Store, a store.CashAsset) []string {
	w := []string{}
	if a.FreezeAuthority != nil {
		w = append(w, "freeze_authority")
	}
	if a.MintAuthority != nil {
		w = append(w, "mint_authority")
	}
	if a.Symbol != "" {
		if rows, err := st.ListCashAssets(ctx, a.Network, false); err == nil {
			for _, o := range rows {
				if o.Mint != a.Mint && o.Symbol == a.Symbol {
					w = append(w, "symbol_collision")
					break
				}
			}
		}
	}
	return w
}
