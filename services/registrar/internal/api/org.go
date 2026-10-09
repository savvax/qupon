package api

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
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

// mountOrg: issuer organisation profile, team invites and series documents (platform v2 §5.3,
// task 807). Organisations are the off-chain access boundary: issuer writes on a series are
// limited to the organisation stored in series_settings (issuerOwnsSeries below).
func mountOrg(r chi.Router, deps Deps, st *store.Store) {
	user := requireUser(deps.Auth)
	issuer := requireRole(deps.Auth, "issuer")
	write := demoThrottle(deps.DemoLimit, "demo:")

	r.With(user).Get("/org", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		if u.OrgID == nil {
			writeErrorCode(w, http.StatusNotFound, "no_org", "your account has no organisation")
			return
		}
		o, err := st.GetOrganization(r.Context(), *u.OrgID)
		if errors.Is(err, store.ErrNotFound) {
			writeErrorCode(w, http.StatusNotFound, "no_org", "your account has no organisation")
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"organization": o})
	})

	r.With(user).Patch("/org", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		if u.IsDemo {
			writeErrorCode(w, http.StatusForbidden, "demo_account", "demo accounts are shared and read-only")
			return
		}
		if u.OrgID == nil {
			writeErrorCode(w, http.StatusNotFound, "no_org", "your account has no organisation")
			return
		}
		var req struct {
			Name    *string `json:"name"`
			BIN     *string `json:"bin"`
			Website *string `json:"website"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		o, err := st.GetOrganization(r.Context(), *u.OrgID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if req.Name != nil {
			o.Name = strings.TrimSpace(*req.Name)
		}
		if req.BIN != nil {
			o.BIN = strings.TrimSpace(*req.BIN)
		}
		if req.Website != nil {
			o.Website = strings.TrimSpace(*req.Website)
		}
		if n := len([]rune(o.Name)); n < 2 || n > 120 {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "name must be 2-120 characters")
			return
		}
		if len(o.BIN) > 12 || len(o.Website) > 200 {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "bin must be at most 12 and website 200 characters")
			return
		}
		// only a website sent in this request is checked: a legacy stored value must not block a name/BIN change
		if req.Website != nil && !validWebsite(o.Website) {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "website must start with http:// or https://")
			return
		}
		if err := st.UpdateOrganization(r.Context(), o); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		audit(st, r, req, true, "organization updated", nil)
		writeJSON(w, http.StatusOK, map[string]any{"organization": o})
	})

	r.With(user).Get("/org/members", orgMembers(st))

	r.With(user).Post("/org/invites", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		if u.IsDemo {
			writeErrorCode(w, http.StatusForbidden, "demo_account", "demo accounts are shared and read-only")
			return
		}
		if u.OrgID == nil {
			writeErrorCode(w, http.StatusNotFound, "no_org", "your account has no organisation")
			return
		}
		var req struct {
			Email string `json:"email"`
			Role  string `json:"role"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		req.Email = strings.ToLower(strings.TrimSpace(req.Email))
		// The plan fixes the invited role to issuer: an issuer organisation invites issuers.
		if !validSignupEmail(req.Email) || req.Role != "issuer" {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "need a valid email and role issuer")
			return
		}
		raw := make([]byte, 32)
		if _, err := rand.Read(raw); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		token := base64.RawURLEncoding.EncodeToString(raw)
		expires := time.Now().Add(7 * 24 * time.Hour)
		if err := st.CreateInvite(r.Context(), auth.HashToken(token), *u.OrgID, req.Role, req.Email, expires.Unix(), u.ID); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		audit(st, r, map[string]any{"email": req.Email, "role": req.Role}, true, "invite issued", nil)
		base := strings.TrimSuffix(os.Getenv("PUBLIC_URL"), "/")
		writeJSON(w, http.StatusCreated, map[string]any{
			"url": base + "/invite/" + token, "expiresAt": expires.UTC().Format(time.RFC3339),
		})
	})

	r.With(user).Delete("/org/members/{id}", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		if u.IsDemo {
			writeErrorCode(w, http.StatusForbidden, "demo_account", "demo accounts are shared and read-only")
			return
		}
		if u.OrgID == nil {
			writeErrorCode(w, http.StatusNotFound, "no_org", "your account has no organisation")
			return
		}
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "member id must be a number")
			return
		}
		m, err := st.GetUser(r.Context(), id)
		if errors.Is(err, store.ErrNotFound) || (err == nil && (m.OrgID == nil || *m.OrgID != *u.OrgID)) {
			writeErrorCode(w, http.StatusNotFound, "not_found", "no such member")
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if m.ID == u.ID {
			writeErrorCode(w, http.StatusBadRequest, "self_removal", "remove yourself by asking an admin")
			return
		}
		if m.IsDemo {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "demo identities cannot be removed here")
			return
		}
		if err := st.SetUserOrg(r.Context(), m.ID, nil); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		audit(st, r, map[string]any{"memberId": m.ID}, true, "member removed", nil)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})

	// Public: consumes a one-time invite token and creates the account in the organisation.
	r.Post("/auth/invite/accept", func(w http.ResponseWriter, r *http.Request) {
		if deps.Auth == nil {
			writeErrorCode(w, http.StatusServiceUnavailable, "auth_unavailable", "auth not configured")
			return
		}
		if deps.SignInLimit != nil && !deps.SignInLimit.Allow(clientIP(r), time.Now()) {
			writeErrorCode(w, http.StatusTooManyRequests, "rate_limited", "too many attempts — try again in a minute")
			return
		}
		var req struct {
			Token    string `json:"token"`
			Name     string `json:"name"`
			Password string `json:"password"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		req.Name = strings.TrimSpace(req.Name)
		if req.Token == "" || req.Name == "" || len(req.Name) > 100 || len(req.Password) < minPassword {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "need a token, a name and a password of 10+ characters")
			return
		}
		orgID, role, email, err := st.ConsumeInvite(r.Context(), auth.HashToken(req.Token), time.Now().Unix())
		if errors.Is(err, store.ErrNotFound) {
			writeErrorCode(w, http.StatusBadRequest, "invalid_token", "invite is unknown, used or expired")
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		u, err := st.CreateUser(r.Context(), store.User{Email: email, Name: req.Name, Role: role, OrgID: &orgID}, hash)
		if errors.Is(err, store.ErrEmailTaken) {
			audit(st, r, map[string]any{"email": email}, false, "invite email taken", nil)
			writeErrorCode(w, http.StatusConflict, "email_taken", "a user with this email already exists")
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		_ = st.Notify(r.Context(), u.ID, "invite_accepted",
			map[string]any{"org": orgID, "email": email}, "invite:"+strconv.FormatInt(u.ID, 10))
		token, u, err := deps.Auth.Login(r.Context(), email, req.Password)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "account created — sign in on the login page")
			return
		}
		audit(st, r, map[string]any{"email": email, "orgId": orgID, "userId": u.ID}, true, "invite accepted", nil)
		writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": toUserDTO(u)})
	})

	// Attach an already-uploaded document (JSON) or upload one directly (multipart) to a series;
	// attached documents are public on the bond page.
	r.With(issuer, write, issuerOwnsSeries(deps, st)).Post("/issuer/series/{mint}/documents", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		mint, ok := pathKey(w, r, "mint")
		if !ok {
			return
		}
		if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data") {
			m := mint.String()
			d, ok := saveDocument(w, r, deps, st, u, &m)
			if !ok {
				return
			}
			audit(st, r, map[string]any{"document": d.ID, "series": mint.String()}, true, "series document uploaded", nil)
			writeJSON(w, http.StatusCreated, map[string]any{"document": d})
			return
		}
		var req struct {
			DocumentID int64  `json:"documentId"`
			Kind       string `json:"kind"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		if req.DocumentID == 0 || !seriesDocKinds[req.Kind] {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "need a documentId and kind prospectus, decision or other")
			return
		}
		d, err := st.GetDocument(r.Context(), req.DocumentID)
		if errors.Is(err, store.ErrNotFound) || (err == nil && d.SeriesMint != nil) {
			writeErrorCode(w, http.StatusNotFound, "not_found", "no such document")
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		// Publishing rewrites the kind and makes the file public (task 1404): only the owner may
		// attach their own upload, and personal KYC documents are never publishable.
		if kycKinds[d.Kind] || d.OwnerUserID != u.ID {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "only your own non-personal documents can be attached")
			return
		}
		if err := st.AttachSeriesDocument(r.Context(), d.ID, mint.String(), req.Kind); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		m := mint.String()
		d.SeriesMint, d.Kind = &m, req.Kind
		audit(st, r, map[string]any{"document": d.ID, "series": m, "kind": req.Kind}, true, "series document attached", nil)
		writeJSON(w, http.StatusCreated, map[string]any{"document": d})
	})

	// Public: the documents attached to a series (metadata only).
	r.Get("/series/{mint}/documents", func(w http.ResponseWriter, r *http.Request) {
		mint, ok := pathKey(w, r, "mint")
		if !ok {
			return
		}
		docs, err := st.ListDocumentsBySeries(r.Context(), mint.String())
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"documents": docs})
	})
}

// seriesDocKinds are the document kinds that may be published on a series (never personal ones).
var seriesDocKinds = map[string]bool{"prospectus": true, "decision": true, "other": true}

// validWebsite: an org website is rendered as a link in the admin console, so only plain
// http(s) URLs may be stored — javascript: and friends are refused at the boundary (empty clears it).
// URL schemes are case-insensitive (RFC 3986 §3.1), so HTTPS://x is accepted (task 1423).
func validWebsite(w string) bool {
	l := strings.ToLower(w)
	return l == "" || strings.HasPrefix(l, "http://") || strings.HasPrefix(l, "https://")
}

func orgMembers(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		if u.OrgID == nil {
			writeErrorCode(w, http.StatusNotFound, "no_org", "your account has no organisation")
			return
		}
		members, err := st.ListOrgMembers(r.Context(), *u.OrgID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		out := make([]userDTO, len(members))
		for i, m := range members {
			out[i] = toUserDTO(m)
		}
		writeJSON(w, http.StatusOK, map[string]any{"members": out})
	}
}

// issuerOwnsSeries scopes issuer writes to the series of the caller's organisation (spec §6):
// series whose settings name an organisation are writable only by that organisation's issuers
// (admins pass every role gate already). Series without an organisation keep the v1 behaviour —
// the shared demo and operator-created series predate organisations.
func issuerOwnsSeries(deps Deps, st *store.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, ok := auth.UserFrom(r.Context())
			if !ok || u.Role == "admin" {
				next.ServeHTTP(w, r)
				return
			}
			mint, ok := seriesMintOf(w, r, deps)
			if !ok {
				return
			}
			x, err := st.GetSeriesSettings(r.Context(), mint)
			if err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			if x.OrgID != nil && (u.OrgID == nil || *u.OrgID != *x.OrgID) {
				writeErrorCode(w, http.StatusForbidden, "not_your_series",
					"this series belongs to another organisation")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// seriesMintOf resolves the series mint of a route's {mint} or action {pda} parameter; for a pda
// it reads the action and its series from the chain reader (when configured).
// Chain read errors fail closed with 502 — an unreadable chain must never satisfy the check.
func seriesMintOf(w http.ResponseWriter, r *http.Request, deps Deps) (string, bool) {
	if mint := chi.URLParam(r, "mint"); mint != "" {
		pk, err := solana.PublicKeyFromBase58(mint)
		if err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "invalid series mint")
			return "", false
		}
		return pk.String(), true
	}
	pda, err := solana.PublicKeyFromBase58(chi.URLParam(r, "pda"))
	if err != nil {
		writeErrorCode(w, http.StatusBadRequest, "invalid_params", "invalid action pda")
		return "", false
	}
	if deps.Read == nil {
		return "", true // no chain reader: the handler answers 503 itself
	}
	action, err := deps.Read.FetchCorporateAction(r.Context(), pda)
	if err != nil {
		writeError(w, http.StatusBadGateway, "read corporate action "+pda.String()+": "+err.Error())
		return "", false // fail closed (task 1404)
	}
	if action == nil {
		return "", true // unknown action: the handler answers 404 itself
	}
	series, err := deps.Read.FetchSeries(r.Context(), action.Series)
	if err != nil {
		writeError(w, http.StatusBadGateway, "read series "+action.Series.String()+": "+err.Error())
		return "", false // fail closed (task 1404)
	}
	if series == nil {
		return "", true // the handler answers 502 itself
	}
	return series.Mint.String(), true
}
