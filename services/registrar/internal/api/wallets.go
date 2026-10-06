package api

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// walletChallengeTTL bounds how long a signed link message stays valid.
const walletChallengeTTL = 10 * time.Minute

// walletLinkMessage is the exact text the wallet signs: it names the account and the address, so a signature
// cannot be replayed for another user or another wallet.
func walletLinkMessage(email, address, nonce string) string {
	return "Qupon wallet link\n" + email + "\n" + address + "\nnonce:" + nonce
}

// verifyWalletSignature checks a base58 ed25519 signature by address over message.
func verifyWalletSignature(address, signature, message string) bool {
	pk, err := solana.PublicKeyFromBase58(address)
	if err != nil {
		return false
	}
	sig, err := solana.SignatureFromBase58(signature)
	if err != nil {
		return false
	}
	return ed25519.Verify(pk[:], []byte(message), sig[:])
}

// mountWallets: wallet linking by signed message (platform v2 §5.3). Demo users share one account, so they
// cannot link wallets.
func mountWallets(r chi.Router, deps Deps, st *store.Store) {
	user := requireUser(deps.Auth)
	now := time.Now
	if deps.Auth != nil && deps.Auth.Now != nil {
		now = deps.Auth.Now
	}
	r.With(user).Get("/me/wallets", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		list, err := st.ListWallets(r.Context(), u.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"wallets": list})
	})

	r.With(user).Post("/me/wallets/challenge", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		if u.IsDemo {
			writeErrorCode(w, http.StatusForbidden, "demo_account", "demo accounts are shared and cannot link wallets")
			return
		}
		var req struct {
			Address string `json:"address"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		if _, err := solana.PublicKeyFromBase58(req.Address); err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "address must be a base58 Solana public key")
			return
		}
		raw := make([]byte, 16)
		if _, err := rand.Read(raw); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		nonce := hex.EncodeToString(raw)
		expires := now().Add(walletChallengeTTL)
		if err := st.CreateWalletChallenge(r.Context(), store.WalletChallenge{
			Nonce: nonce, UserID: u.ID, Address: req.Address, ExpiresAt: expires.Unix(),
		}); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"message":   walletLinkMessage(u.Email, req.Address, nonce),
			"expiresAt": expires.UTC().Format(time.RFC3339),
		})
	})

	r.With(user).Post("/me/wallets", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		if u.IsDemo {
			writeErrorCode(w, http.StatusForbidden, "demo_account", "demo accounts are shared and cannot link wallets")
			return
		}
		var req struct {
			Address   string `json:"address"`
			Signature string `json:"signature"`
			Label     string `json:"label"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		if len(req.Label) > 40 {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "label is at most 40 characters")
			return
		}
		c, err := st.LatestWalletChallenge(r.Context(), u.ID, req.Address, now().Unix())
		if errors.Is(err, store.ErrNoChallenge) {
			writeErrorCode(w, http.StatusBadRequest, "no_challenge", "request a new challenge and sign it within 10 minutes")
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !verifyWalletSignature(req.Address, req.Signature, walletLinkMessage(u.Email, req.Address, c.Nonce)) {
			audit(st, r, map[string]string{"address": req.Address}, false, "bad signature", nil)
			writeErrorCode(w, http.StatusBadRequest, "bad_signature", "the signature does not match this wallet and challenge")
			return
		}
		wallet := store.Wallet{Address: req.Address, UserID: u.ID, Label: req.Label, VerifiedAt: now().Unix()}
		switch err := st.LinkWallet(r.Context(), c.Nonce, wallet); {
		case errors.Is(err, store.ErrWalletTaken):
			writeErrorCode(w, http.StatusConflict, "wallet_taken", "this wallet is linked to another account")
			return
		case errors.Is(err, store.ErrNoChallenge):
			writeErrorCode(w, http.StatusBadRequest, "no_challenge", "challenge already used")
			return
		case err != nil:
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		audit(st, r, map[string]string{"address": req.Address}, true, "wallet linked", nil)
		writeJSON(w, http.StatusCreated, map[string]any{"wallet": wallet})
	})

	r.With(user).Delete("/me/wallets/{address}", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		addr := chi.URLParam(r, "address")
		if err := st.DeleteWallet(r.Context(), u.ID, addr); errors.Is(err, store.ErrNotFound) {
			writeErrorCode(w, http.StatusNotFound, "not_found", "no such wallet on your account")
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		audit(st, r, map[string]string{"address": addr}, true, "wallet unlinked", nil)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
}
