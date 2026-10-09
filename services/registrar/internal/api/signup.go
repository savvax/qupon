package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// mountSignup: investor self sign-up (platform v2 §5.3, task 802). Open on every network — sign-up
// stays enabled even on the mainnet profile. Shares the sign-in per-IP limiter.
func mountSignup(r chi.Router, deps Deps, st *store.Store) {
	r.Post("/auth/signup", authSignup(deps, st))
}

// signupDenyList is the spec's short deny-list of too-lazy passwords; bcrypt still does the real work.
var signupDenyList = map[string]struct{}{
	"password": {}, "password1": {}, "password123": {}, "1234567890": {}, "123456789": {},
	"qwerty123": {}, "qwertyuiop": {}, "letmein123": {}, "welcome123": {}, "admin123456": {},
	"iloveyou123": {}, "monkey123456": {}, "dragon123456": {}, "sunshine123": {}, "princess123": {},
	"football123": {}, "baseball123": {}, "superman123": {}, "solana123456": {}, "qupon123456": {},
}

// validSignupEmail wants exactly one "@", a non-empty local part and a dotted domain — enough to catch
// typos without rejecting exotic-but-valid addresses.
func validSignupEmail(email string) bool {
	if len(email) > 254 || strings.ContainsAny(email, " \t") {
		return false
	}
	local, domain, found := strings.Cut(email, "@")
	return found && local != "" && strings.Count(email, "@") == 1 &&
		strings.Contains(domain, ".") && !strings.HasPrefix(domain, ".") && !strings.HasSuffix(domain, ".")
}

func authSignup(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Auth == nil {
			writeErrorCode(w, http.StatusServiceUnavailable, "auth_unavailable", "auth not configured")
			return
		}
		if deps.SignInLimit != nil && !deps.SignInLimit.Allow(clientIP(r), time.Now()) {
			writeErrorCode(w, http.StatusTooManyRequests, "rate_limited",
				"too many sign-ups from this address — try again in a minute")
			return
		}
		var req struct {
			Email    string `json:"email"`
			Name     string `json:"name"`
			Password string `json:"password"`
			Locale   string `json:"locale"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		req.Email = strings.ToLower(strings.TrimSpace(req.Email))
		req.Name = strings.TrimSpace(req.Name)
		if req.Locale == "" {
			req.Locale = "en"
		}
		pw := strings.ToLower(req.Password)
		switch {
		case !validSignupEmail(req.Email) || req.Name == "" || len(req.Name) > 100 ||
			(req.Locale != "en" && req.Locale != "ru" && req.Locale != "kk"):
			writeErrorCode(w, http.StatusBadRequest, "invalid_params",
				"need a valid email, a name and a locale in en/ru/kk")
			return
		case len(req.Password) < minPassword:
			writeErrorCode(w, http.StatusBadRequest, "weak_password", "password must be at least 10 characters")
			return
		}
		if _, bad := signupDenyList[pw]; bad {
			writeErrorCode(w, http.StatusBadRequest, "weak_password", "this password is too common — choose another")
			return
		}
		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		u, err := st.CreateUser(r.Context(), store.User{Email: req.Email, Name: req.Name, Role: "investor"}, hash)
		switch {
		case errors.Is(err, store.ErrEmailTaken):
			audit(st, r, map[string]any{"email": req.Email}, false, "email taken", nil)
			writeErrorCode(w, http.StatusConflict, "email_taken", "a user with this email already exists")
			return
		case err != nil:
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if req.Locale != "en" { // CreateUser defaults to en; self sign-up carries the chosen locale
			if err := st.UpdateProfile(r.Context(), u.ID, u.Name, req.Locale); err != nil {
				writeError(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
		// The account exists and is active; issue the session through the ordinary sign-in path.
		token, u, err := deps.Auth.Login(r.Context(), req.Email, req.Password)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "account created — sign in on the login page")
			return
		}
		audit(st, r, map[string]any{"email": req.Email, "userId": u.ID}, true, "investor sign-up", nil)
		writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": toUserDTO(u)})
	}
}
