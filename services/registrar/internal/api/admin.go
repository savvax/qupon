package api

// Admin panel API (platform v2 §5.2, plan task 701): users, organisations,
// series settings and the audit feed, plus the public password-reset endpoint.
// Every write is audited; audit params never contain passwords or tokens.

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/csv"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

var (
	adminRoles  = []string{"issuer", "registrar", "investor", "admin"}
	userStatus  = []string{"active", "disabled", "pending"}
	kaseTicker  = regexp.MustCompile(`^[A-Za-z0-9]{2,12}$`)
	resetTTL    = 24 * time.Hour
	minPassword = 10
)

// mountAdmin wires the admin routes (task 701). Everything under /admin needs
// role admin; POST /auth/reset is public and consumes a one-time token.
func mountAdmin(r chi.Router, deps Deps, st *store.Store) {
	gate := requireRole(deps.Auth, "admin")
	r.With(gate).Get("/admin/users", adminListUsers(st))
	r.With(gate).Post("/admin/users", adminCreateUser(st))
	r.With(gate).Patch("/admin/users/{id}", adminPatchUser(st))
	r.With(gate).Post("/admin/users/{id}/reset-link", adminResetLink(st))
	r.With(gate).Get("/admin/organizations", adminListOrgs(st))
	r.With(gate).Post("/admin/organizations", adminCreateOrg(st))
	r.With(gate).Patch("/admin/organizations/{id}", adminPatchOrg(st))
	r.With(gate).Get("/admin/series", adminListSeries(deps, st))
	r.With(gate).Patch("/admin/series/{mint}", adminPatchSeries(st))
	r.With(gate).Get("/admin/audit", adminAudit(st))
	r.Post("/auth/reset", authReset(st))
}

func adminListUsers(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		users, err := st.ListUsers(r.Context(), q.Get("q"), q.Get("role"), q.Get("status"))
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		out := make([]userDTO, len(users))
		for i, u := range users {
			out[i] = toUserDTO(u)
		}
		writeJSON(w, http.StatusOK, map[string]any{"users": out})
	}
}

func adminCreateUser(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Email    string `json:"email"`
			Name     string `json:"name"`
			Role     string `json:"role"`
			OrgID    *int64 `json:"orgId"`
			Password string `json:"password"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		req.Email = strings.ToLower(strings.TrimSpace(req.Email))
		if !strings.Contains(req.Email, "@") || req.Name == "" ||
			!slices.Contains(adminRoles, req.Role) || len(req.Password) < minPassword {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params",
				"need an email, a name, a role in issuer/registrar/investor/admin and a password of 10+ characters")
			return
		}
		if req.OrgID != nil {
			if _, err := st.GetOrganization(r.Context(), *req.OrgID); err != nil {
				writeErrorCode(w, http.StatusBadRequest, "invalid_params", "orgId does not exist")
				return
			}
		}
		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		u, err := st.CreateUser(r.Context(), store.User{Email: req.Email, Name: req.Name, Role: req.Role, OrgID: req.OrgID}, hash)
		switch {
		case errors.Is(err, store.ErrEmailTaken):
			writeErrorCode(w, http.StatusConflict, "email_taken", "a user with this email already exists")
			return
		case err != nil:
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		audit(st, r, map[string]any{"email": req.Email, "name": req.Name, "role": req.Role, "orgId": req.OrgID},
			true, "user created", nil)
		writeJSON(w, http.StatusCreated, map[string]any{"user": toUserDTO(u)})
	}
}

func adminPatchUser(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "user id must be a number")
			return
		}
		var req struct {
			Role   *string `json:"role"`
			OrgID  *int64  `json:"orgId"`
			Status *string `json:"status"`
			Name   *string `json:"name"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		if (req.Role != nil && !slices.Contains(adminRoles, *req.Role)) ||
			(req.Status != nil && !slices.Contains(userStatus, *req.Status)) {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "unknown role or status")
			return
		}
		if req.OrgID != nil && *req.OrgID != 0 {
			if _, err := st.GetOrganization(r.Context(), *req.OrgID); err != nil {
				writeErrorCode(w, http.StatusBadRequest, "invalid_params", "orgId does not exist")
				return
			}
		}
		u, err := st.GetUser(r.Context(), id)
		if errors.Is(err, store.ErrNotFound) {
			writeErrorCode(w, http.StatusNotFound, "not_found", "no such user")
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if u.IsDemo {
			// Demo identities are shared and seeded: no admin-owned password lifecycle (task 9700).
			writeErrorCode(w, http.StatusForbidden, "demo_account", "demo accounts are shared and read-only")
			return
		}
		if self, ok := auth.UserFrom(r.Context()); ok && self.ID == u.ID {
			// An admin must not lock themselves out of the panel — any non-active
			// status counts, not only an explicit disable (task 9700).
			if (req.Status != nil && *req.Status != "active") || (req.Role != nil && *req.Role != "admin") {
				writeErrorCode(w, http.StatusBadRequest, "self_lockout",
					"admins cannot disable, set themselves pending or demote themselves")
				return
			}
		}
		if req.Role != nil {
			u.Role = *req.Role
		}
		if req.OrgID != nil {
			if *req.OrgID == 0 {
				u.OrgID = nil
			} else {
				u.OrgID = req.OrgID
			}
		}
		if req.Status != nil {
			u.Status = *req.Status
		}
		if req.Name != nil && *req.Name != "" {
			u.Name = *req.Name
		}
		if err := st.UpdateUser(r.Context(), u); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if u.Status == "disabled" {
			if err := st.DeleteUserSessions(r.Context(), u.ID); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
		audit(st, r, req, true, "user updated (status "+u.Status+")", nil)
		writeJSON(w, http.StatusOK, map[string]any{"user": toUserDTO(u)})
	}
}

func adminResetLink(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "user id must be a number")
			return
		}
		u, err := st.GetUser(r.Context(), id)
		if errors.Is(err, store.ErrNotFound) {
			writeErrorCode(w, http.StatusNotFound, "not_found", "no such user")
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if u.IsDemo {
			writeErrorCode(w, http.StatusForbidden, "demo_account", "demo accounts are shared and read-only")
			return
		}
		raw := make([]byte, 32)
		if _, err := rand.Read(raw); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		token := base64.RawURLEncoding.EncodeToString(raw)
		self, _ := auth.UserFrom(r.Context())
		expires := time.Now().Add(resetTTL)
		if err := st.CreateResetLink(r.Context(), auth.HashToken(token), id, expires.Unix(), self.ID); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		audit(st, r, map[string]any{"userId": id}, true, "reset link issued", nil)
		base := strings.TrimSuffix(os.Getenv("PUBLIC_URL"), "/")
		writeJSON(w, http.StatusOK, map[string]any{
			"url": base + "/reset/" + token, "expiresAt": expires.UTC().Format(time.RFC3339),
		})
	}
}

// authReset is public: it consumes a one-time reset token and sets a new
// password (10+ characters) in the same transaction, revoking the user's sessions.
func authReset(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Token    string `json:"token"`
			Password string `json:"password"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		if req.Token == "" || len(req.Password) < minPassword {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "need a token and a password of 10+ characters")
			return
		}
		// Hash first: a failure here must not burn the token.
		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		userID, err := st.ResetPassword(r.Context(), auth.HashToken(req.Token), time.Now().Unix(), hash)
		if errors.Is(err, store.ErrNotFound) {
			writeErrorCode(w, http.StatusBadRequest, "invalid_token", "reset link is unknown, used or expired")
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		// The requester is anonymous; the row records whose password was reset. The reset itself succeeded — only
		// the audit trail is degraded if this write fails.
		_ = st.InsertAudit(r.Context(), store.AuditEntry{
			Ts: time.Now().Unix(), UserID: userID, Role: "reset", Route: "POST /auth/reset",
			Params: []byte("{}"), OK: true, Detail: "password reset via token",
		})
		w.WriteHeader(http.StatusNoContent)
	}
}

func adminListOrgs(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orgs, err := st.ListOrganizations(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"organizations": orgs})
	}
}

func adminCreateOrg(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req store.Organization
		if !decodeJSON(w, r, &req) {
			return
		}
		if req.Name == "" || (req.Kind != "issuer" && req.Kind != "registrar") {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "need a name and kind issuer or registrar")
			return
		}
		req.Website = strings.TrimSpace(req.Website)
		if !validWebsite(req.Website) {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "website must start with http:// or https://")
			return
		}
		org, err := st.CreateOrganization(r.Context(), req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		audit(st, r, req, true, "organization created", nil)
		writeJSON(w, http.StatusCreated, map[string]any{"organization": org})
	}
}

func adminPatchOrg(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "organization id must be a number")
			return
		}
		var req struct {
			Name    *string `json:"name"`
			Kind    *string `json:"kind"`
			BIN     *string `json:"bin"`
			Website *string `json:"website"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		if (req.Kind != nil && *req.Kind != "issuer" && *req.Kind != "registrar") ||
			(req.Name != nil && *req.Name == "") {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "kind must be issuer or registrar, name non-empty")
			return
		}
		if req.Website != nil && !validWebsite(strings.TrimSpace(*req.Website)) {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "website must start with http:// or https://")
			return
		}
		org, err := st.GetOrganization(r.Context(), id)
		if errors.Is(err, store.ErrNotFound) {
			writeErrorCode(w, http.StatusNotFound, "not_found", "no such organization")
			return
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if req.Name != nil {
			org.Name = *req.Name
		}
		if req.Kind != nil {
			org.Kind = *req.Kind
		}
		if req.BIN != nil {
			org.BIN = *req.BIN
		}
		if req.Website != nil {
			org.Website = strings.TrimSpace(*req.Website)
		}
		if err := st.UpdateOrganization(r.Context(), org); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		audit(st, r, req, true, "organization updated", nil)
		writeJSON(w, http.StatusOK, map[string]any{"organization": org})
	}
}

// adminSeriesRow is one series with its settings (GET /admin/series).
type adminSeriesRow struct {
	Mint       string `json:"mint"`
	PDA        string `json:"pda"`
	Ticker     string `json:"ticker"`
	ISIN       string `json:"isin"`
	Hidden     bool   `json:"hidden"`
	Featured   bool   `json:"featured"`
	NoAutofund bool   `json:"noAutofund"` // task 91541: scheduler skips funding the escrow
	DemoClock  uint32 `json:"demoClock"`  // chain day_secs: 0 = real Almaty clock
	InDefault  bool   `json:"inDefault"`  // chain in_default: an action Defaulted and not cured
	KaseTicker string `json:"kaseTicker"`
	OrgID      *int64 `json:"orgId"`
	UpdatedAt  int64  `json:"updatedAt"`
}

func adminListSeries(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		settings, err := st.ListSeriesSettings(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		rows := map[string]adminSeriesRow{}
		if deps.Read != nil {
			recs, err := deps.Read.AllSeries(r.Context())
			if err != nil {
				writeError(w, http.StatusBadGateway, err.Error())
				return
			}
			for _, rec := range recs {
				mint := rec.Series.Mint.String()
				rows[mint] = adminSeriesRow{Mint: mint, PDA: rec.PDA.String(),
					Ticker:    strings.TrimRight(string(rec.Series.Ticker[:]), "\x00"),
					ISIN:      strings.TrimRight(string(rec.Series.ISIN[:]), "\x00"),
					DemoClock: rec.Series.DaySecs, InDefault: rec.Series.InDefault == 1}
			}
		} else { // no chain reader: the startup mirror
			stored, err := st.ListSeries(r.Context())
			if err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			for _, row := range stored {
				var view struct{ PDA, Ticker, ISIN string }
				_ = json.Unmarshal(row.Data, &view)
				rows[row.Mint] = adminSeriesRow{Mint: row.Mint, PDA: view.PDA, Ticker: view.Ticker, ISIN: view.ISIN}
			}
		}
		// Settings-only rows (a hidden series the mirror lost) still belong in the list.
		for mint := range settings {
			if _, ok := rows[mint]; !ok {
				rows[mint] = adminSeriesRow{Mint: mint}
			}
		}
		out := make([]adminSeriesRow, 0, len(rows))
		for mint, row := range rows {
			x := settings[mint]
			row.Hidden, row.Featured, row.NoAutofund = x.Hidden, x.Featured, x.NoAutofund
			row.KaseTicker, row.OrgID, row.UpdatedAt = x.KaseTicker, x.OrgID, x.UpdatedAt
			out = append(out, row)
		}
		sort.Slice(out, func(i, j int) bool { return out[i].Mint < out[j].Mint })
		writeJSON(w, http.StatusOK, map[string]any{"series": out})
	}
}

func adminPatchSeries(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		mint, ok := pathKey(w, r, "mint")
		if !ok {
			return
		}
		var req struct {
			Hidden     *bool   `json:"hidden"`
			Featured   *bool   `json:"featured"`
			KaseTicker *string `json:"kaseTicker"`
			OrgID      *int64  `json:"orgId"`
			NoAutofund *bool   `json:"noAutofund"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		if req.KaseTicker != nil && *req.KaseTicker != "" && !kaseTicker.MatchString(*req.KaseTicker) {
			writeErrorCode(w, http.StatusBadRequest, "invalid_params", "kaseTicker must match ^[A-Za-z0-9]{2,12}$")
			return
		}
		if req.OrgID != nil && *req.OrgID != 0 {
			if _, err := st.GetOrganization(r.Context(), *req.OrgID); err != nil {
				writeErrorCode(w, http.StatusBadRequest, "invalid_params", "orgId does not exist")
				return
			}
		}
		x, err := st.GetSeriesSettings(r.Context(), mint.String())
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if req.Hidden != nil {
			x.Hidden = *req.Hidden
		}
		if req.Featured != nil {
			x.Featured = *req.Featured
		}
		if req.KaseTicker != nil {
			x.KaseTicker = *req.KaseTicker
		}
		if req.OrgID != nil {
			if *req.OrgID == 0 {
				x.OrgID = nil
			} else {
				x.OrgID = req.OrgID
			}
		}
		if err := st.UpsertSeriesSettings(r.Context(), x); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		// The scenario flag has its own column and writer, so an UpsertSeriesSettings never resets it (task 91541).
		if req.NoAutofund != nil {
			if err := st.SetSeriesNoAutofund(r.Context(), mint.String(), *req.NoAutofund); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
			x.NoAutofund = *req.NoAutofund
		}
		audit(st, r, map[string]any{"mint": mint.String(), "hidden": x.Hidden, "featured": x.Featured,
			"kaseTicker": x.KaseTicker, "orgId": x.OrgID, "noAutofund": x.NoAutofund}, true, "series settings updated", nil)
		writeJSON(w, http.StatusOK, map[string]any{"series": x})
	}
}

func adminAudit(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		f := store.AuditFilter{User: q.Get("user"), Role: q.Get("role"), Route: q.Get("route")}
		if v := q.Get("ok"); v != "" {
			b, err := strconv.ParseBool(v)
			if err != nil {
				writeErrorCode(w, http.StatusBadRequest, "invalid_params", "ok must be true or false")
				return
			}
			f.OK = &b
		}
		for name, dst := range map[string]*int64{"from": &f.From, "to": &f.To} {
			if v := q.Get(name); v != "" {
				if t, err := strconv.ParseInt(v, 10, 64); err == nil {
					*dst = t
				} else if p, err := time.Parse("2006-01-02", v); err == nil {
					// A date is a whole Almaty day: "from" is its midnight there, "to" runs to
					// the end of it (task 9700). Kazakhstan is UTC+5 year-round (no DST since 2024).
					day := time.Date(p.Year(), p.Month(), p.Day(), 0, 0, 0, 0, almaty)
					*dst = day.Unix()
					if name == "to" {
						*dst = day.Add(24*time.Hour - time.Second).Unix()
					}
				} else {
					writeErrorCode(w, http.StatusBadRequest, "invalid_params", name+" must be unix seconds or YYYY-MM-DD")
					return
				}
			}
		}
		if v := q.Get("limit"); v != "" {
			n, err := strconv.Atoi(v)
			if err != nil || n < 1 || n > 1000 {
				writeErrorCode(w, http.StatusBadRequest, "invalid_params", "limit must be 1..1000")
				return
			}
			f.Limit = n
		}
		entries, err := st.SearchAudit(r.Context(), f)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if q.Get("format") == "csv" {
			w.Header().Set("Content-Type", "text/csv; charset=utf-8")
			w.Header().Set("Content-Disposition", "attachment; filename=audit.csv")
			cw := csv.NewWriter(w)
			_ = cw.Write([]string{"id", "time", "user", "role", "route", "ok", "detail", "params", "signatures"})
			for _, e := range entries {
				row := []string{strconv.FormatInt(e.ID, 10), dateTime(e.Ts), e.Email, e.Role, e.Route,
					strconv.FormatBool(e.OK), e.Detail, string(e.Params), strings.Join(e.Signatures, " ")}
				for i, c := range row { // formula-injection guard (task 9700)
					row[i] = csvSafe(c)
				}
				_ = cw.Write(row)
			}
			cw.Flush()
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
	}
}

// csvSafe neutralises spreadsheet formula injection: a cell that starts with
// =, +, - or @ is prefixed with an apostrophe so Excel/Sheets shows it as text.
func csvSafe(s string) string {
	if s != "" && strings.ContainsRune("=+-@", rune(s[0])) {
		return "'" + s
	}
	return s
}
