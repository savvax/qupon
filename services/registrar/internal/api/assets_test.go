package api

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/assets"
	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
	solana "github.com/solana-foundation/solana-go/v2"
)

const (
	assetProgram = "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd" // not a token program
	mintA        = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
	mintB        = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
)

// newAssetServer builds an API whose chain client is a fake getAccountInfo RPC:
// accounts maps mint address -> fixture (owner program id, data bytes). Addresses
// absent from the map answer "account not found".
func newAssetServer(t *testing.T, accounts map[string][2]any) (http.Handler, *store.Store, *auth.Service) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Params []json.RawMessage `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		var addr string
		_ = json.Unmarshal(req.Params[0], &addr)
		var value any
		if acc, ok := accounts[addr]; ok {
			value = map[string]any{
				"data":       []string{base64.StdEncoding.EncodeToString(acc[1].([]byte)), "base64"},
				"executable": false, "lamports": 1, "owner": acc[0].(string), "rentEpoch": 0,
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0", "id": 1,
			"result": map[string]any{"context": map[string]any{"slot": 1}, "value": value},
		})
	}))
	t.Cleanup(srv.Close)

	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "assets.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	program, _ := solana.PublicKeyFromBase58(assetProgram)
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(5, time.Minute)}
	h := New(slog.New(slog.DiscardHandler), st, Deps{Auth: svc, Chain: chain.NewClient(srv.URL, program, slog.New(slog.DiscardHandler))})
	return h, st, svc
}

// fixtureMint builds an 82-byte classic mint with optional authorities.
func fixtureMint(withMintAuth, withFreezeAuth bool) []byte {
	d := make([]byte, 82)
	auth := solana.MustPublicKeyFromBase58(mintB)
	if withMintAuth {
		binary.LittleEndian.PutUint32(d[0:4], 1)
		copy(d[4:36], auth[:])
	}
	binary.LittleEndian.PutUint64(d[36:44], 1_000_000)
	d[44] = 6
	d[45] = 1
	if withFreezeAuth {
		binary.LittleEndian.PutUint32(d[46:50], 1)
		copy(d[50:82], auth[:])
	}
	return d
}

func doJSONReq(t *testing.T, h http.Handler, method, path, body, token string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.NewDecoder(rec.Body).Decode(&out)
	return rec.Code, out
}

// doJSONListReq is doJSONReq for array responses (e.g. GET /assets).
func doJSONListReq(t *testing.T, h http.Handler, method, path, body, token string) (int, []any) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out []any
	_ = json.NewDecoder(rec.Body).Decode(&out)
	return rec.Code, out
}

func addAssetOK(t *testing.T, h http.Handler, admin string, mint string) map[string]any {
	t.Helper()
	code, body := doJSONReq(t, h, http.MethodPost, "/admin/assets", `{"mint":"`+mint+`"}`, admin)
	if code != http.StatusCreated {
		t.Fatalf("add asset %s = %d %v", mint, code, body)
	}
	return body
}

func TestAssetsRoutesRequireAdmin(t *testing.T) {
	h, st, svc := newAssetServer(t, nil)
	issuer := signIn(t, h, st, svc, "issuer")
	for _, tc := range []struct{ method, path string }{
		{http.MethodGet, "/admin/assets"},
		{http.MethodPost, "/admin/assets"},
		{http.MethodPatch, "/admin/assets/" + mintA},
	} {
		if code, _ := doJSONReq(t, h, tc.method, tc.path, `{}`, issuer); code != http.StatusForbidden {
			t.Errorf("%s %s as issuer = %d, want 403", tc.method, tc.path, code)
		}
		if code, _ := doJSONReq(t, h, tc.method, tc.path, `{}`, ""); code != http.StatusUnauthorized {
			t.Errorf("%s %s anonymous = %d, want 401", tc.method, tc.path, code)
		}
	}
}

func TestAddAssetStoresDisabled(t *testing.T) {
	h, st, svc := newAssetServer(t, map[string][2]any{
		mintA: {assets.TokenProgram, fixtureMint(true, true)},
	})
	admin := signIn(t, h, st, svc, "admin")

	code, body := doJSONReq(t, h, http.MethodPost, "/admin/assets", `{"mint":"`+mintA+`"}`, admin)
	if code != http.StatusCreated {
		t.Fatalf("add = %d %v", code, body)
	}
	asset, _ := body["asset"].(map[string]any)
	if asset["enabled"] != false || asset["decimals"] != float64(6) || asset["tokenProgram"] != assets.TokenProgram {
		t.Fatalf("asset = %v", asset)
	}
	if asset["mintAuthority"] == nil || asset["freezeAuthority"] == nil {
		t.Fatalf("on-chain authorities missing: %v", asset)
	}
	warnings, _ := body["warnings"].([]any)
	has := func(s string) bool {
		for _, w := range warnings {
			if w == s {
				return true
			}
		}
		return false
	}
	if !has("mint_authority") || !has("freeze_authority") {
		t.Fatalf("warnings = %v, want mint_authority and freeze_authority", warnings)
	}

	row, err := st.GetCashAsset(t.Context(), "devnet", mintA)
	if err != nil || row.Enabled || row.Decimals != 6 || row.VerifiedAt == nil {
		t.Fatalf("stored row = %+v (%v), want disabled verified devnet asset", row, err)
	}
	// Disabled asset is invisible on the public list.
	code, list := doJSONListReq(t, h, http.MethodGet, "/assets", "", "")
	if code != http.StatusOK || len(list) != 0 {
		t.Fatalf("public /assets = %d %v, want empty", code, list)
	}
}

func TestAddAssetErrors(t *testing.T) {
	uninit := fixtureMint(false, false)
	uninit[45] = 0 // is_initialized flag = 0: an unusable mint (task 9700)
	h, st, svc := newAssetServer(t, map[string][2]any{
		mintA: {assets.TokenProgram, fixtureMint(false, false)},
		mintB: {assetProgram, fixtureMint(false, false)}, // a valid non-token program owner
		"So11111111111111111111111111111111111111112": {assets.TokenProgram, make([]byte, 165)},
		"11111111111111111111111111111111":            {assets.TokenProgram, uninit},
	})
	admin := signIn(t, h, st, svc, "admin")
	addAssetOK(t, h, admin, mintA)

	cases := []struct {
		name, mint string
		wantCode   int
		wantErr    string
	}{
		{"not base58", "not-an-address", http.StatusBadRequest, "invalid_params"},
		{"duplicate", mintA, http.StatusConflict, "asset_exists"},
		{"absent on chain", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", http.StatusBadRequest, "not_a_mint"},
		{"token account", "So11111111111111111111111111111111111111112", http.StatusBadRequest, "not_a_mint"},
		{"uninitialised mint", "11111111111111111111111111111111", http.StatusBadRequest, "not_a_mint"},
		{"foreign program", mintB, http.StatusBadRequest, "unknown_token_program"},
	}
	for _, tc := range cases {
		code, body := doJSONReq(t, h, http.MethodPost, "/admin/assets", `{"mint":"`+tc.mint+`"}`, admin)
		if code != tc.wantCode || body["code"] != tc.wantErr {
			t.Errorf("%s: got %d %v, want %d %s", tc.name, code, body["code"], tc.wantCode, tc.wantErr)
		}
	}
}

func TestEnableWithFreezeAuthorityNeedsConfirmation(t *testing.T) {
	freezeMint := "8xNqLc6qQvXn4x9vCkF3kJFwG2NvAic1zPMoPJTg2kR4"
	h, st, svc := newAssetServer(t, map[string][2]any{
		freezeMint: {assets.Token2022Program, fixtureMint(false, true)},
	})
	admin := signIn(t, h, st, svc, "admin")
	addAssetOK(t, h, admin, freezeMint)
	patch := "/admin/assets/" + freezeMint

	code, body := doJSONReq(t, h, http.MethodPatch, patch, `{"enabled":true}`, admin)
	if code != http.StatusBadRequest || body["code"] != "freeze_authority_unconfirmed" {
		t.Fatalf("enable without accept = %d %v, want 400 freeze_authority_unconfirmed", code, body)
	}
	if row, err := st.GetCashAsset(t.Context(), "devnet", freezeMint); err != nil || row.Enabled {
		t.Fatalf("asset enabled without confirmation: %+v (%v)", row, err)
	}

	code, body = doJSONReq(t, h, http.MethodPatch, patch, `{"enabled":true,"acceptFreezeAuthority":true,"symbol":"FRT","kind":"stablecoin"}`, admin)
	if code != http.StatusOK {
		t.Fatalf("enable with accept = %d %v", code, body)
	}
	code, list := doJSONListReq(t, h, http.MethodGet, "/assets", "", "")
	if code != http.StatusOK || len(list) != 1 {
		t.Fatalf("public /assets = %d %v, want the enabled asset", code, list)
	}
	if got := list[0].(map[string]any); got["symbol"] != "FRT" || got["kind"] != "stablecoin" {
		t.Fatalf("public row = %v", got)
	}
}

func TestPatchAssetMetadataAndWarnings(t *testing.T) {
	h, st, svc := newAssetServer(t, map[string][2]any{
		mintA: {assets.TokenProgram, fixtureMint(true, false)},
		mintB: {assets.TokenProgram, fixtureMint(false, false)},
	})
	admin := signIn(t, h, st, svc, "admin")
	addAssetOK(t, h, admin, mintA)
	addAssetOK(t, h, admin, mintB)

	if code, body := doJSONReq(t, h, http.MethodPatch, "/admin/assets/"+mintA,
		`{"symbol":"tKZT","name":"Test tenge"}`, admin); code != http.StatusOK {
		t.Fatalf("patch metadata = %d %v", code, body)
	}

	// Second asset takes the same symbol: allowed, but warned.
	code, body := doJSONReq(t, h, http.MethodPatch, "/admin/assets/"+mintB, `{"symbol":"tKZT"}`, admin)
	if code != http.StatusOK {
		t.Fatalf("patch collision = %d %v", code, body)
	}
	warnings, _ := body["warnings"].([]any)
	found := false
	for _, w := range warnings {
		if w == "symbol_collision" {
			found = true
		}
	}
	if !found {
		t.Fatalf("warnings = %v, want symbol_collision", warnings)
	}

	// Unknown mint and bad kind are rejected with the documented codes.
	if code, body := doJSONReq(t, h, http.MethodPatch, "/admin/assets/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
		`{"symbol":"X"}`, admin); code != http.StatusNotFound || body["code"] != "not_found" {
		t.Errorf("patch unknown mint = %d %v, want 404 not_found", code, body)
	}
	if code, body := doJSONReq(t, h, http.MethodPatch, "/admin/assets/"+mintA,
		`{"kind":"nft"}`, admin); code != http.StatusBadRequest || body["code"] != "invalid_params" {
		t.Errorf("patch bad kind = %d %v, want 400 invalid_params", code, body)
	}
}

// Task 9700: PATCH metadata bounds and the symbol-required-before-enable rule.
func TestPatchAssetValidation(t *testing.T) {
	h, st, svc := newAssetServer(t, map[string][2]any{
		mintA: {assets.TokenProgram, fixtureMint(false, false)},
	})
	admin := signIn(t, h, st, svc, "admin")
	addAssetOK(t, h, admin, mintA)

	for _, tc := range []struct{ name, body string }{
		{"symbol too long", `{"symbol":"ABCDEFGHIJKLM"}`}, // 13 chars
		{"symbol blank", `{"symbol":"   "}`},
		{"name too long", `{"name":"` + strings.Repeat("n", 61) + `"}`},
		{"name blank", `{"name":"  "}`},
	} {
		if code, body := doJSONReq(t, h, http.MethodPatch, "/admin/assets/"+mintA, tc.body, admin); code != http.StatusBadRequest || body["code"] != "invalid_params" {
			t.Errorf("%s: got %d %v, want 400 invalid_params", tc.name, code, body["code"])
		}
	}

	// Enabling without a symbol is refused; with one it works.
	if code, body := doJSONReq(t, h, http.MethodPatch, "/admin/assets/"+mintA, `{"enabled":true}`, admin); code != http.StatusBadRequest || body["code"] != "invalid_params" {
		t.Fatalf("enable without symbol = %d %v, want 400 invalid_params", code, body["code"])
	}
	if code, body := doJSONReq(t, h, http.MethodPatch, "/admin/assets/"+mintA, `{"symbol":"TKZ","enabled":true}`, admin); code != http.StatusOK {
		t.Fatalf("enable with symbol = %d %v", code, body)
	}
}
