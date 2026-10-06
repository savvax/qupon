package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
	"github.com/qupon-kz/qupon/services/registrar/internal/termsheet"
)

const btrkText = `Bonds KZ2C00018703 (BTRKb33) of National Managing Holding Baiterek JSC included in KASE official list.
Main characteristics of the bonds: issuer – National Managing Holding Baiterek JSC; face value – 1,000 tenge;
coupon rate – 15.95% per annum; coupon payment frequency – semi-annual; day count convention – 30/360;
circulation period – 03.07.2026 – 03.07.2031.`

func termsOf(t *testing.T, out map[string]any) map[string]map[string]any {
	t.Helper()
	raw, _ := json.Marshal(out["terms"])
	var terms map[string]map[string]any
	if err := json.Unmarshal(raw, &terms); err != nil {
		t.Fatalf("terms: %v in %v", err, out)
	}
	return terms
}

func TestImportTermsheetRoles(t *testing.T) {
	h, svc, st := newAuthServer(t, false)
	body, _ := json.Marshal(map[string]string{"text": btrkText})
	if code, _ := doPost(t, h, "/issuer/import/termsheet", string(body), ""); code != http.StatusUnauthorized {
		t.Fatalf("anonymous = %d, want 401", code)
	}
	for role, want := range map[string]int{"issuer": http.StatusOK, "admin": http.StatusOK,
		"registrar": http.StatusForbidden, "investor": http.StatusForbidden} {
		if code, out := doPost(t, h, "/issuer/import/termsheet", string(body), signIn(t, h, st, svc, role)); code != want {
			t.Errorf("%s = %d %v, want %d", role, code, out, want)
		}
	}
}

func TestImportTermsheetRegexFallback(t *testing.T) {
	h, svc, st := newAuthServer(t, false) // Deps.Termsheet nil → SIMULATED regex
	tok := signIn(t, h, st, svc, "issuer")
	if code, out := doPost(t, h, "/issuer/import/termsheet", `{"text":"  "}`, tok); code != http.StatusBadRequest || out["code"] != "invalid_body" {
		t.Fatalf("empty = %d %v", code, out)
	}
	if code, _ := doPost(t, h, "/issuer/import/termsheet", `{"text":"`+strings.Repeat("x", 70<<10)+`"}`, tok); code != http.StatusBadRequest {
		t.Fatalf("oversized = %d, want 400", code)
	}
	body, _ := json.Marshal(map[string]string{"text": btrkText})
	code, out := doPost(t, h, "/issuer/import/termsheet", string(body), tok)
	if code != http.StatusOK || out["source"] != "regex" || out["simulated"] != true {
		t.Fatalf("regex = %d %v", code, out)
	}
	terms := termsOf(t, out)
	if terms["isin"]["value"] != "KZ2C00018703" || terms["couponBps"]["value"] != float64(1595) ||
		terms["faceValue"]["value"] != float64(100000) || terms["frequency"]["value"] != float64(2) ||
		terms["dayCount"]["value"] != "THIRTY_360" || terms["issueDate"]["value"] != "2026-07-03" ||
		terms["maturityDate"]["value"] != "2031-07-03" {
		t.Fatalf("terms = %v", terms)
	}
	rows, err := st.ListAudit(t.Context(), 1)
	if err != nil || len(rows) != 1 {
		t.Fatalf("audit: %v %d", err, len(rows))
	}
	p := string(rows[0].Params)
	if rows[0].Route != "POST /issuer/import/termsheet" || !rows[0].OK ||
		!strings.Contains(p, `"source":"regex"`) || !strings.Contains(p, "KZ2C00018703") || strings.Contains(p, "Baiterek") {
		t.Fatalf("audit row = %+v", rows[0])
	}
}

func TestImportTermsheetLLM(t *testing.T) {
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []map[string]any{{"message": map[string]string{
			"content": `{"isin":"KZ2C00018703","ticker":"BTRKb33","faceValue":1000,"currency":"KZT","couponRatePct":15.95,"frequency":2,"dayCount":"THIRTY_360","issueDate":"2026-07-03","maturityDate":"2031-07-03","confidence":{"isin":"high"}}`,
		}}}})
	}))
	defer fake.Close()
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "import.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(5, time.Minute)}
	h := New(slog.New(slog.DiscardHandler), st, Deps{Auth: svc,
		Termsheet: &termsheet.Extractor{URL: fake.URL, Model: "glm-test", Key: "test-key"}})
	tok := signIn(t, h, st, svc, "issuer")
	code, out := doPost(t, h, "/issuer/import/termsheet", `{"text":"anything"}`, tok)
	if code != http.StatusOK || out["source"] != "llm" || out["simulated"] != false {
		t.Fatalf("llm = %d %v", code, out)
	}
	terms := termsOf(t, out)
	if terms["isin"]["value"] != "KZ2C00018703" || terms["isin"]["confidence"] != "high" ||
		terms["couponBps"]["value"] != float64(1595) || terms["issuerName"]["confidence"] != "missing" {
		t.Fatalf("terms = %v", terms)
	}
}
