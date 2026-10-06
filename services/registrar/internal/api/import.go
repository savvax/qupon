// Term-sheet import (task 042, EXPERIMENTAL): pasted KASE text → series terms
// through internal/termsheet (LLM, or the SIMULATED regex fallback). The route
// lives under /issuer/ so the web's /api/bo allowlist admits it (the task text
// said /import/termsheet). Nothing is written except the audit row; the issuer
// confirms every field in the wizard.
package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
	"github.com/qupon-kz/qupon/services/registrar/internal/termsheet"
)

func mountImport(r chi.Router, deps Deps, st *store.Store) {
	r.With(requireRole(deps.Auth, "issuer")).Post("/issuer/import/termsheet", importTermsheet(deps, st))
}

func importTermsheet(deps Deps, st *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Text string `json:"text"`
		}
		if !decodeJSON(w, r, &body) { // decodeJSON caps the body at 64 KB
			return
		}
		terms, src, err := deps.Termsheet.Extract(r.Context(), body.Text)
		if err != nil { // empty text (the 64 KB cap is enforced by decodeJSON first)
			writeErrorCode(w, http.StatusBadRequest, "invalid_body", err.Error())
			return
		}
		// Audit the source and the ISIN, never the pasted text.
		audit(st, r, map[string]any{"source": src, "isin": terms.ISIN.Value}, true, "termsheet import ("+string(src)+")", nil)
		writeJSON(w, http.StatusOK, map[string]any{
			"source":    src,
			"simulated": src == termsheet.SourceRegex,
			"terms":     terms,
		})
	}
}
