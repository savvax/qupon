package api

// Sign-in routes: POST /auth/login, /auth/demo, /auth/logout; GET /me. The web keeps the returned token in an
// httpOnly cookie and sends it back as a bearer; the browser never sees it.

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

type userDTO struct {
	ID     int64  `json:"id"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	Role   string `json:"role"`
	IsDemo bool   `json:"isDemo"`
	OrgID  *int64 `json:"orgId"`
	Status string `json:"status"`
	Locale string `json:"locale"`
}

func toUserDTO(u store.User) userDTO {
	return userDTO{ID: u.ID, Email: u.Email, Name: u.Name, Role: u.Role, IsDemo: u.IsDemo,
		OrgID: u.OrgID, Status: u.Status, Locale: u.Locale}
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

func authLogin(svc *auth.Service, perIP *auth.Limiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if svc == nil {
			writeErrorCode(w, http.StatusServiceUnavailable, "auth_unavailable", "auth not configured")
			return
		}
		if perIP != nil && !perIP.Allow(clientIP(r), time.Now()) {
			writeErrorCode(w, http.StatusTooManyRequests, "rate_limited", "too many sign-ins from this address — try again in a minute")
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

func authDemo(svc *auth.Service, perIP *auth.Limiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if svc == nil {
			writeErrorCode(w, http.StatusServiceUnavailable, "auth_unavailable", "auth not configured")
			return
		}
		if perIP != nil && !perIP.Allow(clientIP(r), time.Now()) {
			writeErrorCode(w, http.StatusTooManyRequests, "rate_limited", "too many sign-ins from this address — try again in a minute")
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

// clientIP is the last X-Forwarded-For hop — appended by the closest proxy (Caddy),
// so a client cannot forge it; the web session proxy forwards the header verbatim
// over the internal network. No XFF (direct/internal caller) → the TCP peer.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[len(parts)-1])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
