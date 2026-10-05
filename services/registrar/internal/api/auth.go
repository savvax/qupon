package api

// Sign-in routes: POST /auth/login, /auth/demo, /auth/logout; GET /me. The web keeps the returned token in an
// httpOnly cookie and sends it back as a bearer; the browser never sees it.

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

type userDTO struct {
	ID     int64  `json:"id"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	Role   string `json:"role"`
	IsDemo bool   `json:"isDemo"`
}

func toUserDTO(u store.User) userDTO {
	return userDTO{ID: u.ID, Email: u.Email, Name: u.Name, Role: u.Role, IsDemo: u.IsDemo}
}

// demoRoles maps the public demo role names to back-office roles.
var demoRoles = map[string]string{"issuer": "issuer", "registrar": "registrar", "investor": "investor_demo"}

func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(v); err != nil {
		writeErrorCode(w, http.StatusBadRequest, "invalid_params", "body must be JSON: "+err.Error())
		return false
	}
	return true
}

func writeSession(w http.ResponseWriter, token string, u store.User, err error) {
	switch {
	case errors.Is(err, auth.ErrBadCredentials):
		writeErrorCode(w, http.StatusUnauthorized, "bad_credentials", err.Error())
	case errors.Is(err, auth.ErrRateLimited):
		writeErrorCode(w, http.StatusTooManyRequests, "rate_limited", err.Error())
	case errors.Is(err, auth.ErrDemoDisabled):
		writeErrorCode(w, http.StatusForbidden, "demo_disabled", err.Error())
	case err != nil:
		writeErrorCode(w, http.StatusInternalServerError, "internal", "sign-in failed")
	default:
		writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": toUserDTO(u)})
	}
}

func authLogin(svc *auth.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if svc == nil {
			writeErrorCode(w, http.StatusServiceUnavailable, "auth_unavailable", "auth not configured")
			return
		}
		var req struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		if req.Email == "" || req.Password == "" {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "email and password are required")
			return
		}
		token, u, err := svc.Login(r.Context(), req.Email, req.Password)
		writeSession(w, token, u, err)
	}
}

func authDemo(svc *auth.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if svc == nil {
			writeErrorCode(w, http.StatusServiceUnavailable, "auth_unavailable", "auth not configured")
			return
		}
		var req struct {
			Role string `json:"role"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		role, ok := demoRoles[req.Role]
		if !ok {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "role must be issuer, registrar or investor")
			return
		}
		token, u, err := svc.Demo(r.Context(), role)
		writeSession(w, token, u, err)
	}
}

func authLogout(svc *auth.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if svc != nil {
			_ = svc.Logout(r.Context(), bearer(r))
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func authMe(svc *auth.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if svc == nil {
			writeErrorCode(w, http.StatusServiceUnavailable, "auth_unavailable", "auth not configured")
			return
		}
		u, err := svc.Authenticate(r.Context(), bearer(r))
		if err != nil {
			writeErrorCode(w, http.StatusUnauthorized, "unauthenticated", "sign in required")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"user": toUserDTO(u)})
	}
}
