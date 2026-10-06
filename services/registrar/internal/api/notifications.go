package api

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// mountNotifications: the signed-in user's in-app notifications (platform v2 §5.4, task 805). Rows come from
// notify.FromEvent (ingest) and the KYC decision handler.
func mountNotifications(r chi.Router, deps Deps, st *store.Store) {
	user := requireUser(deps.Auth)

	r.With(user).Get("/me/notifications", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		list, err := st.ListNotifications(r.Context(), u.ID, r.URL.Query().Get("unread") == "1", limit)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"notifications": list})
	})

	r.With(user).Get("/me/notifications/count", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		n, err := st.UnreadNotifications(r.Context(), u.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"unread": n})
	})

	r.With(user).Post("/me/notifications/read", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		var req struct {
			IDs []int64 `json:"ids"`
			All bool    `json:"all"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		if !req.All && len(req.IDs) == 0 {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "pass ids or all: true")
			return
		}
		n, err := st.MarkNotificationsRead(r.Context(), u.ID, req.IDs, req.All)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "marked": n})
	})
}
