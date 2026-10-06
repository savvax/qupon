package api

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// maxDocument bounds one upload (platform v2 §6).
const maxDocument = 10 << 20

var documentKinds = map[string]bool{
	"id_document": true, "proof_of_address": true, "prospectus": true, "decision": true, "other": true,
}

// kycKinds are personal documents: never uploaded to a shared demo account.
var kycKinds = map[string]bool{"id_document": true, "proof_of_address": true}

// sniffDocument accepts PDF, PNG and JPEG by magic bytes (the client's Content-Type and extension are ignored).
func sniffDocument(head []byte) (string, bool) {
	switch {
	case bytes.HasPrefix(head, []byte("%PDF-")):
		return "application/pdf", true
	case bytes.HasPrefix(head, []byte("\x89PNG\r\n\x1a\n")):
		return "image/png", true
	case bytes.HasPrefix(head, []byte("\xff\xd8\xff")):
		return "image/jpeg", true
	}
	return "", false
}

// cleanFilename keeps a display name: base name only, printable, ≤ 100 runes.
func cleanFilename(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f || r == '"' {
			return -1
		}
		return r
	}, name)
	if r := []rune(name); len(r) > 100 {
		name = string(r[:100])
	}
	if name == "" || name == "." || name == "/" {
		name = "document"
	}
	return name
}

// canReadDocument: the owner, members of the owning organisation, registrars and admins; documents attached to a
// series are public (prospectus, decisions).
func canReadDocument(d store.Document, u *store.User) bool {
	if d.SeriesMint != nil {
		return true
	}
	if u == nil {
		return false
	}
	switch {
	case u.ID == d.OwnerUserID, u.Role == "registrar", u.Role == "admin":
		return true
	case d.OrgID != nil && u.OrgID != nil && *d.OrgID == *u.OrgID:
		return true
	}
	return false
}

// saveDocument stores one multipart upload for u (shared by /me/documents and issuer series documents).
func saveDocument(w http.ResponseWriter, r *http.Request, deps Deps, st *store.Store, u store.User, seriesMint *string) (store.Document, bool) {
	if deps.DataDir == "" {
		writeErrorCode(w, http.StatusServiceUnavailable, "documents_unavailable", "document storage not configured (DATA_DIR)")
		return store.Document{}, false
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxDocument+64<<10)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		writeErrorCode(w, http.StatusBadRequest, "invalid_params", "multipart form with a file field of at most 10 MB")
		return store.Document{}, false
	}
	defer func() { _ = r.MultipartForm.RemoveAll() }()
	kind := r.FormValue("kind")
	if !documentKinds[kind] {
		writeErrorCode(w, http.StatusBadRequest, "invalid_params", "kind must be id_document, proof_of_address, prospectus, decision or other")
		return store.Document{}, false
	}
	if u.IsDemo && kycKinds[kind] {
		writeErrorCode(w, http.StatusForbidden, "demo_account", "demo accounts are shared: personal documents cannot be uploaded")
		return store.Document{}, false
	}
	f, hdr, err := r.FormFile("file")
	if err != nil {
		writeErrorCode(w, http.StatusBadRequest, "invalid_params", "missing file field")
		return store.Document{}, false
	}
	defer func() { _ = f.Close() }()
	body, err := io.ReadAll(io.LimitReader(f, maxDocument+1))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return store.Document{}, false
	}
	if len(body) > maxDocument {
		writeErrorCode(w, http.StatusRequestEntityTooLarge, "too_large", "documents are at most 10 MB")
		return store.Document{}, false
	}
	mimeType, ok := sniffDocument(body)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "unsupported_type", "upload a PDF, PNG or JPEG")
		return store.Document{}, false
	}
	sum := sha256.Sum256(body)
	hash := hex.EncodeToString(sum[:])
	dir := filepath.Join(deps.DataDir, "docs")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return store.Document{}, false
	}
	path := filepath.Join(dir, hash)
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		if err := os.WriteFile(path, body, 0o600); err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return store.Document{}, false
		}
	}
	d, err := st.CreateDocument(r.Context(), store.Document{
		OwnerUserID: u.ID, OrgID: u.OrgID, Kind: kind, Filename: cleanFilename(hdr.Filename),
		Mime: mimeType, Size: int64(len(body)), SHA256: hash, Path: path, SeriesMint: seriesMint,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return store.Document{}, false
	}
	return d, true
}

// mountDocuments: uploads and access-checked downloads (platform v2 §5.3, §6).
func mountDocuments(r chi.Router, deps Deps, st *store.Store) {
	r.With(requireUser(deps.Auth)).Post("/me/documents", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		d, ok := saveDocument(w, r, deps, st, u, nil)
		if !ok {
			return
		}
		audit(st, r, map[string]any{"document": d.ID, "kind": d.Kind}, true, "document uploaded", nil)
		writeJSON(w, http.StatusCreated, map[string]any{"document": d})
	})

	r.With(requireUser(deps.Auth)).Get("/me/documents", func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		docs, err := st.ListDocumentsByOwner(r.Context(), u.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"documents": docs})
	})

	// Optional session: attached series documents are public, everything else needs the right user. A document
	// the caller may not read answers 404, exactly like a missing one.
	r.Get("/documents/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			writeErrorCode(w, http.StatusNotFound, "not_found", "no such document")
			return
		}
		var user *store.User
		if deps.Auth != nil {
			if u, err := deps.Auth.Authenticate(r.Context(), bearer(r)); err == nil {
				user = &u
			}
		}
		d, err := st.GetDocument(r.Context(), id)
		if err != nil || !canReadDocument(d, user) {
			writeErrorCode(w, http.StatusNotFound, "not_found", "no such document")
			return
		}
		body, err := os.ReadFile(d.Path)
		if err != nil {
			writeErrorCode(w, http.StatusNotFound, "not_found", "document file missing")
			return
		}
		h := w.Header()
		h.Set("Content-Type", d.Mime)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Cache-Control", "private, no-store")
		h.Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": d.Filename}))
		_, _ = w.Write(body)
	})
}
