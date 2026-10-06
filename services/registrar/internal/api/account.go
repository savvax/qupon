package api

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// mountAccount: self-service profile and password (platform v2 §5.3). Demo identities are shared and read-only.
func mountAccount(r chi.Router, deps Deps, st *store.Store) {
	user := requireUser(deps.Auth)

	r.With(user).Patch("/me/profile", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		if u.IsDemo {
			writeErrorCode(w, http.StatusForbidden, "demo_account", "demo accounts are shared and read-only")
			return
		}
		var req struct {
			Name   *string `json:"name"`
			Locale *string `json:"locale"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		name, locale := u.Name, u.Locale
		if req.Name != nil {
			name = strings.TrimSpace(*req.Name)
		}
		if req.Locale != nil {
			locale = *req.Locale
		}
		if n := len([]rune(name)); n < 1 || n > 80 {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "name must be 1-80 characters")
			return
		}
		if locale != "en" && locale != "ru" {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "locale must be en or ru")
			return
		}
		if err := st.UpdateProfile(r.Context(), u.ID, name, locale); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		u.Name, u.Locale = name, locale
		audit(st, r, map[string]string{"name": name, "locale": locale}, true, "profile updated", nil)
		writeJSON(w, http.StatusOK, map[string]any{"user": toUserDTO(u)})
	})

	r.With(user).Post("/me/password", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		if u.IsDemo {
			writeErrorCode(w, http.StatusForbidden, "demo_account", "demo accounts are shared and read-only")
			return
		}
		var req struct {
			Current string `json:"current"`
			New     string `json:"new"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		_, hash, err := st.UserByEmail(r.Context(), u.Email)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if !auth.CheckPassword(hash, req.Current) {
			audit(st, r, map[string]string{}, false, "wrong current password", nil)
			writeErrorCode(w, http.StatusBadRequest, "bad_credentials", "the current password is wrong")
			return
		}
		if len([]rune(req.New)) < 10 || req.New == req.Current {
			writeErrorCode(w, http.StatusBadRequest, "weak_password", "use at least 10 characters, different from the current password")
			return
		}
		newHash, err := auth.HashPassword(req.New)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if err := st.SetUserPassword(r.Context(), u.ID, newHash); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		// Everyone else holding this account's sessions is signed out; this browser stays signed in.
		if err := st.DeleteOtherSessions(r.Context(), u.ID, auth.HashToken(bearer(r))); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		audit(st, r, map[string]string{}, true, "password changed", nil)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
}
