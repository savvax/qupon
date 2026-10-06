package api

// Back-office access control (product spec §4/§6): every write that signs with operator keys requires a session
// whose role is allowed; admins pass every gate. Reads stay public.

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

func bearer(r *http.Request) string {
	if t, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok {
		return strings.TrimSpace(t)
	}
	return ""
}

// requireRole admits a request whose session user has one of roles (or is admin); 401 without a valid session,
// 403 for another role. The user is stored in the request context (auth.UserFrom).
func requireRole(svc *auth.Service, roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if svc == nil {
				writeErrorCode(w, http.StatusServiceUnavailable, "auth_unavailable", "auth not configured")
				return
			}
			u, err := svc.Authenticate(r.Context(), bearer(r))
			if err != nil {
				writeErrorCode(w, http.StatusUnauthorized, "unauthenticated", "sign in required")
				return
			}
			if !slices.Contains(roles, u.Role) && u.Role != "admin" {
				writeErrorCode(w, http.StatusForbidden, "forbidden", "role "+u.Role+" may not do this")
				return
			}
			next.ServeHTTP(w, r.WithContext(auth.WithUser(r.Context(), u)))
		})
	}
}

// requireUser admits any signed-in user, whatever the role (account, notifications, documents).
func requireUser(svc *auth.Service) func(http.Handler) http.Handler {
	return requireRole(svc, "issuer", "registrar", "investor_demo", "investor")
}

// writeErrorCode writes the openapi Error shape ({code, message}); "error" repeats the message for older clients.
func writeErrorCode(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"code": code, "message": msg, "error": msg})
}

// audit records one back-office write. It never fails the request: a broken audit trail is logged, not surfaced.
func audit(st *store.Store, r *http.Request, params any, ok bool, detail string, sigs []string) {
	u, _ := auth.UserFrom(r.Context())
	p, err := json.Marshal(params)
	if err != nil {
		p = []byte("{}")
	}
	if sigs == nil {
		sigs = []string{}
	}
	if err := st.InsertAudit(r.Context(), store.AuditEntry{
		Ts: time.Now().Unix(), UserID: u.ID, Role: u.Role, Route: r.Method + " " + r.URL.Path,
		Params: p, OK: ok, Detail: detail, Signatures: sigs,
	}); err != nil {
		slog.ErrorContext(r.Context(), "audit write failed", "route", r.URL.Path, "err", err)
	}
}

// demoThrottle caps writes by demo users (shared accounts anyone can sign in as): `prefix+role` is the limiter key, so
// the cap is per demo role across all visitors. Real accounts are never throttled; nil limiter = no cap. Must run
// after requireRole (the user comes from the context).
func demoThrottle(l *auth.Limiter, prefix string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if l == nil {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if u, ok := auth.UserFrom(r.Context()); ok && u.IsDemo && !l.Allow(prefix+u.Role, time.Now()) {
				writeErrorCode(w, http.StatusTooManyRequests, "demo_throttled", "demo limit reached — try again later")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
