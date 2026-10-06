// KASE market data (platform v2 §5.5, task 1001): public, cached endpoints
// backed by internal/kase. Never blocks a page on kase.kz: failures answer
// kase_unavailable or the cached body marked stale.
package api

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/qupon-kz/qupon/services/registrar/internal/kase"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

func mountKase(r chi.Router, deps Deps, st *store.Store) {
	r.Get("/kase/bonds/{ticker}", kaseBond(deps))
	// The star route catches path-shaped "tickers" (../x) so the handler can
	// reject them with invalid_ticker instead of chi's anonymous 404.
	r.Get("/kase/bonds/{ticker}/*", kaseBond(deps))
	r.Get("/kase/news/{issuer}", kaseNews(deps))
	// The series→ticker link (series_settings.kase_ticker, task 701) so the
	// public bond page knows which series carry a KASE panel (task 1002).
	r.Get("/kase/series/{mint}", kaseSeriesTicker(st))
}

// kaseSeriesTicker answers {ticker} for a series linked in series_settings, 404
// no_kase_ticker when the series has no link. Public read: tickers are not secret.
func kaseSeriesTicker(st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		mint := chi.URLParam(r, "mint")
		// Length sanity only: the mint never reaches an upstream URL, just a
		// parameterised store lookup, and demo placeholder mints need not decode.
		if len(mint) < 32 || len(mint) > 48 {
			writeErrorCode(w, http.StatusBadRequest, "invalid_mint", "mint must be a base58 address")
			return
		}
		x, err := st.GetSeriesSettings(r.Context(), mint)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		if x.KaseTicker == "" {
			writeErrorCode(w, http.StatusNotFound, "no_kase_ticker", "series has no KASE ticker")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"ticker": x.KaseTicker})
	}
}

func kaseBond(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ticker := chi.URLParam(r, "ticker")
		if !kase.ValidCode(ticker) || chi.URLParam(r, "*") != "" {
			writeErrorCode(w, http.StatusBadRequest, "invalid_ticker", "ticker must match ^[A-Za-z0-9]{2,12}$")
			return
		}
		if deps.Kase == nil {
			writeErrorCode(w, http.StatusServiceUnavailable, "kase_unavailable", "kase client not configured")
			return
		}
		// cold cache: up to five paced upstream requests (1/s) with a 5 s timeout each
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		bond, err := deps.Kase.Bond(ctx, ticker)
		switch {
		case errors.Is(err, kase.ErrNotFound):
			writeErrorCode(w, http.StatusNotFound, "kase_not_found", "kase.kz has no bond "+ticker)
		case errors.Is(err, kase.ErrInvalidCode):
			writeErrorCode(w, http.StatusBadRequest, "invalid_ticker", "ticker must match ^[A-Za-z0-9]{2,12}$")
		case err != nil:
			writeErrorCode(w, http.StatusBadGateway, "kase_unavailable", "kase.kz is unavailable")
		default:
			writeJSON(w, http.StatusOK, bond)
		}
	}
}

func kaseNews(deps Deps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		issuer := chi.URLParam(r, "issuer")
		lang := r.URL.Query().Get("lang")
		if lang != "" && lang != "en" && lang != "ru" {
			writeError(w, http.StatusBadRequest, "lang must be en or ru")
			return
		}
		if !kase.ValidCode(issuer) {
			writeError(w, http.StatusBadRequest, "invalid issuer code (^[A-Za-z0-9]{2,12}$)")
			return
		}
		if deps.Kase == nil {
			writeErrorCode(w, http.StatusServiceUnavailable, "kase_unavailable", "kase client not configured")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		news, err := deps.Kase.News(ctx, issuer, lang)
		switch {
		case errors.Is(err, kase.ErrNotFound):
			writeErrorCode(w, http.StatusNotFound, "kase_not_found", "kase.kz has no issuer "+issuer)
		case err != nil:
			writeErrorCode(w, http.StatusBadGateway, "kase_unavailable", "kase.kz is unavailable")
		default:
			writeJSON(w, http.StatusOK, news)
		}
	}
}
