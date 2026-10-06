package api

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/borsh"
	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/kase"
	"github.com/qupon-kz/qupon/services/registrar/internal/notice"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// Test keys for the disclosure fixtures: one series (mint 2:2), one completed
// INTR action, one BMET meeting, one holder entitlement, cash mint 3:3 (tKZT).
var (
	disSeries = solana.PublicKey{1: 1}
	disMint   = solana.PublicKey{2: 2}
	disCash   = solana.PublicKey{3: 3}
	disOwner  = solana.PublicKey{4: 4}
	disAction = solana.PublicKey{5: 5} // record 2007-05-28: matches the KASE fixation
	disOffRec = solana.PublicKey{6: 6} // record 2007-05-27: one day off the fixation
	disMeet   = solana.PublicKey{7: 7} // BMET without a coupon period
)

func disDate(y int, m time.Month, d int) int64 {
	return time.Date(y, m, d, 0, 0, 0, 0, almaty).Unix()
}

func disCorpID(s string) []byte {
	out := make([]byte, 16)
	copy(out, s)
	return out
}

// disAccountBytes builds account data: discriminator + borsh body.
func disAccountBytes(name string, body []byte) []byte {
	disc, err := chain.AccountDiscriminator(name)
	if err != nil {
		panic(err)
	}
	return append(disc[:], body...)
}

func disSeriesBytes() []byte {
	body := borsh.NewWriter().
		U8(1).
		Pubkey(disMint).
		Pubkey(disCash).
		Pubkey(solana.PublicKey{7: 7}). // registrar
		Pubkey(solana.PublicKey{8: 8}). // issuer
		Pubkey(solana.PublicKey{9: 9}). // paying agent
		FixedBytes([]byte("KZ2C00000065")).
		FixedBytes([]byte("TEBNb1\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00")).
		U64(100_000).
		U32(850).
		U8(2).
		U8(0).
		I64(disDate(2006, 11, 29)).
		I64(disDate(2026, 11, 29)).
		I64(disDate(2007, 11, 28)).
		I64(disDate(2007, 5, 29)).
		U8(0).
		U64(100).
		U32(1).
		U16(5000).
		U16(6667).
		Pubkey(solana.PublicKey{10: 10}).
		OptionPubkey(nil).
		FixedBytes(make([]byte, 64)). // reserved
		FixedBytes(make([]byte, 32)). // realloc slack of a None open_action
		Bytes()
	return disAccountBytes("Series", body)
}

func disActionBytes(_ solana.PublicKey, kind uint8, status uint8, record, payment, periodStart, periodEnd int64) []byte {
	body := borsh.NewWriter().
		U8(1).
		Pubkey(disSeries).
		U32(1).
		U8(kind).
		U8(0). // MAND
		FixedBytes(disCorpID("TEBN-INTR-0001")).
		FixedBytes(make([]byte, 16)).
		I64(disDate(2007, 5, 20)).
		I64(record).
		I64(payment).
		I64(periodStart).
		I64(periodEnd).
		U32(10).
		U32(850).
		U64(4_250).
		U64(0).
		Pubkey(disCash).
		Pubkey(solana.PublicKey{11: 11}).
		U8(status).
		U64(1234).
		Pubkey(solana.PublicKey{12: 12}).
		U64(100).
		U32(1).
		U32(1).
		U64(425_000).
		U64(0).
		U64(425_000).
		U64(425_000).
		U64(0).
		U32(0).
		U32(0).
		I64(0).
		I64(0).
		U64(0).
		U64(0).
		U64(0).
		U8(0).
		I64(disDate(2007, 6, 8)).
		U16(0).
		U64(0).
		FixedBytes(make([]byte, 64)).
		Bytes()
	return disAccountBytes("CorporateAction", body)
}

func disEntitlementBytes(action solana.PublicKey) []byte {
	body := borsh.NewWriter().
		U8(1).
		Pubkey(action).
		Pubkey(disOwner).
		U64(100).
		U64(425_000).
		U64(0).
		U64(425_000).
		U64(0).
		U8(2). // Paid
		I64(disDate(2007, 6, 8)).
		U8(0).
		I64(0).
		Bytes()
	return disAccountBytes("Entitlement", body)
}

// disMintBytes builds a classic 2-decimal cash mint (tKZT-like).
func disMintBytes() []byte {
	d := make([]byte, 82)
	d[44] = 2
	d[45] = 1
	return d
}

// newDisclosureServer wires the API against a fake RPC (accounts below) and
// the captured kase.kz fixtures. failing flips kase.kz to 500.
func newDisclosureServer(t *testing.T, failing *atomic.Bool) (http.Handler, *store.Store, *auth.Service) {
	t.Helper()
	qupon, _ := solana.PublicKeyFromBase58(assetProgram)
	accounts := map[string][2]any{
		disSeries.String():                {assetProgram, disSeriesBytes()},
		disAction.String():                {assetProgram, disActionBytes(disAction, 0, 5, disDate(2007, 5, 28), disDate(2007, 6, 8), disDate(2007, 5, 29), disDate(2007, 6, 8))},
		disOffRec.String():                {assetProgram, disActionBytes(disOffRec, 0, 5, disDate(2007, 5, 27), disDate(2007, 6, 8), disDate(2007, 5, 29), disDate(2007, 6, 8))},
		disMeet.String():                  {assetProgram, disActionBytes(disMeet, 4, 3, disDate(2007, 5, 26), disDate(2007, 5, 26), 0, 0)},
		solana.PublicKey{13: 13}.String(): {assetProgram, disEntitlementBytes(disAction)},
		disCash.String():                  {assetProgram, disMintBytes()}, // mint owner is not checked by DecodeMint
	}

	rpcSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string            `json:"method"`
			Params []json.RawMessage `json:"params"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		switch req.Method {
		case "getAccountInfo":
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
		case "getProgramAccounts":
			// Honor the client's memcmp filters (discriminator at 0, action key at 9):
			// the fake owns Series/Action/Entitlement accounts and must not mix them.
			var cfg struct {
				Filters []struct {
					Memcmp *struct {
						Offset int             `json:"offset"`
						Bytes  json.RawMessage `json:"bytes"`
					} `json:"memcmp"`
				} `json:"filters"`
			}
			_ = json.Unmarshal(req.Params[1], &cfg)
			matches := func(data []byte) bool {
				for _, f := range cfg.Filters {
					if f.Memcmp == nil {
						continue
					}
					var want solana.Base58
					if json.Unmarshal(f.Memcmp.Bytes, &want) != nil {
						return false
					}
					if f.Memcmp.Offset+len(want) > len(data) || !bytes.Equal(data[f.Memcmp.Offset:f.Memcmp.Offset+len(want)], want) {
						return false
					}
				}
				return true
			}
			var rows []map[string]any
			for addr, acc := range accounts {
				if acc[0].(string) != assetProgram || !matches(acc[1].([]byte)) {
					continue
				}
				rows = append(rows, map[string]any{
					"pubkey": addr,
					"account": map[string]any{
						"data":       []string{base64.StdEncoding.EncodeToString(acc[1].([]byte)), "base64"},
						"executable": false, "lamports": 1, "owner": acc[0].(string), "rentEpoch": 0,
					},
				})
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": rows})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{
				"jsonrpc": "2.0", "id": 1,
				"error": map[string]any{"code": -32601, "message": "method not found: " + req.Method},
			})
		}
	}))
	t.Cleanup(rpcSrv.Close)

	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "disclosure.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	if err := st.UpsertSeriesSettings(t.Context(), store.SeriesSettings{SeriesMint: disMint.String(), KaseTicker: "TEBNb10"}); err != nil {
		t.Fatal(err)
	}

	client := chain.NewClient(rpcSrv.URL, qupon, slog.New(slog.DiscardHandler))
	clock := time.Unix(1760000000, 0)
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(5, time.Minute)}
	h := New(slog.New(slog.DiscardHandler), st, Deps{
		Chain:  client,
		Notice: notice.NewReader(client, "Qupon Test Issuer"),
		Kase:   &kase.Service{Client: &kase.Client{Base: kaseUpstream(t, failing).URL}, Store: st, Now: func() time.Time { return clock }},
		Auth:   svc,
	})
	return h, st, svc
}

func TestDisclosureKaseCheckMatchAndMismatch(t *testing.T) {
	h, st, _ := newDisclosureServer(t, new(atomic.Bool))
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)

	var check kaseCheckDTO
	getJSON(t, srv.URL+"/actions/"+disAction.String()+"/kase-check", http.StatusOK, &check)
	if check.Status != "ok" || !check.Match {
		t.Fatalf("check = %+v, want ok/match for fixation 2007-05-28 == record 2007-05-28", check)
	}
	if check.KaseFixation != "2007-05-28" || check.RecordDate != "2007-05-28" || check.Ticker != "TEBNb10" {
		t.Fatalf("dates = kase %s vs record %s (ticker %s)", check.KaseFixation, check.RecordDate, check.Ticker)
	}
	if check.KasePeriod == nil || check.KasePeriod.Start != "2007-05-29" || check.KasePeriod.End != "2007-06-08" {
		t.Fatalf("kase period = %+v", check.KasePeriod)
	}

	// Same period, record one day before the fixation → mismatch (second action, same server).
	getJSON(t, srv.URL+"/actions/"+disOffRec.String()+"/kase-check", http.StatusOK, &check)
	if check.Status != "ok" || check.Match {
		t.Fatalf("check = %+v, want ok with match=false (fixation 2007-05-28 vs record 2007-05-27)", check)
	}

	// A meeting (BMET, no coupon period) has nothing to compare.
	getJSON(t, srv.URL+"/actions/"+disMeet.String()+"/kase-check", http.StatusOK, &check)
	if check.Status != "no_period" {
		t.Fatalf("meeting check = %+v, want no_period", check)
	}

	// A series without a kase ticker in its settings.
	if err := st.UpsertSeriesSettings(t.Context(), store.SeriesSettings{SeriesMint: disMint.String(), KaseTicker: ""}); err != nil {
		t.Fatal(err)
	}
	getJSON(t, srv.URL+"/actions/"+disAction.String()+"/kase-check", http.StatusOK, &check)
	if check.Status != "no_ticker" {
		t.Fatalf("untickered check = %+v, want no_ticker", check)
	}
}

func TestDisclosureKaseCheckUnavailable(t *testing.T) {
	failing := new(atomic.Bool)
	failing.Store(true)
	h, _, _ := newDisclosureServer(t, failing)
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)

	var out struct {
		Code string `json:"code"`
	}
	getJSON(t, srv.URL+"/actions/"+disAction.String()+"/kase-check", http.StatusBadGateway, &out)
	if out.Code != "kase_unavailable" {
		t.Fatalf("code = %q, want kase_unavailable", out.Code)
	}
}

func TestDisclosureZip(t *testing.T) {
	h, _, _ := newDisclosureServer(t, new(atomic.Bool))
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)

	resp, err := http.Get(srv.URL + "/actions/" + disAction.String() + "/disclosure.zip")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(resp.Body)
		t.Fatalf("zip status = %d: %s", resp.StatusCode, errBody)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	zr, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		t.Fatalf("unzip: %v", err)
	}
	names := map[string]bool{}
	for _, f := range zr.File {
		names[f.Name] = true
	}
	want := []string{
		"notice.en.txt", "notice.ru.txt",
		"seev031.TEBN-INTR-0001.xml",
		"seev036.TEBN-INTR-0001." + disOwner.String() + ".xml",
		"manifest.json",
	}
	for _, n := range want {
		if !names[n] {
			t.Errorf("zip misses %s (has %v)", n, names)
		}
	}
	mf, err := zr.Open("manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		CorpID string `json:"corpId"`
		Files  []struct {
			Name string `json:"name"`
			Kind string `json:"kind"`
		} `json:"files"`
		Simulated bool `json:"simulated"`
	}
	if err := json.NewDecoder(mf).Decode(&manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.CorpID != "TEBN-INTR-0001" || len(manifest.Files) != len(want)-1 || !manifest.Simulated { // manifest.json lists the package, not itself
		t.Fatalf("manifest = %+v", manifest)
	}

	// The meeting is not settled (status 3): its notices do not exist yet → 409.
	resp2, err := http.Get(srv.URL + "/actions/" + disMeet.String() + "/disclosure.zip")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp2.Body.Close() }()
	if resp2.StatusCode != http.StatusConflict {
		t.Fatalf("unsettled zip status = %d, want 409", resp2.StatusCode)
	}
}

func TestDisclosureSubmit(t *testing.T) {
	h, st, svc := newDisclosureServer(t, new(atomic.Bool))
	registrar := signIn(t, h, st, svc, "registrar")
	issuer := signIn(t, h, st, svc, "issuer")

	// 401 without a session, 403 for a non-registrar, 200 + audit row for the registrar.
	code, body := doJSONReq(t, h, http.MethodPost, "/actions/"+disAction.String()+"/disclosure/submit", "{}", "")
	if code != http.StatusUnauthorized {
		t.Fatalf("anonymous submit = %d %v", code, body)
	}
	code, body = doJSONReq(t, h, http.MethodPost, "/actions/"+disAction.String()+"/disclosure/submit", "{}", issuer)
	if code != http.StatusForbidden {
		t.Fatalf("issuer submit = %d %v", code, body)
	}
	code, body = doJSONReq(t, h, http.MethodPost, "/actions/"+disAction.String()+"/disclosure/submit", "{}", registrar)
	if code != http.StatusOK || body["ok"] != true || body["simulated"] != true {
		t.Fatalf("registrar submit = %d %v", code, body)
	}
	// The allowlisted /registrar alias answers the same handler.
	code, body = doJSONReq(t, h, http.MethodPost, "/registrar/actions/"+disAction.String()+"/disclosure/submit", "{}", registrar)
	if code != http.StatusOK || body["simulated"] != true {
		t.Fatalf("alias submit = %d %v", code, body)
	}

	audits, err := st.ListAudit(t.Context(), 10)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, a := range audits {
		if strings.Contains(a.Route, "/disclosure/submit") && strings.Contains(a.Detail, "SIMULATED") {
			found = true
		}
	}
	if !found {
		t.Fatalf("no SIMULATED disclosure audit row in %d rows", len(audits))
	}

	// Unknown action pda → 404; malformed → 400.
	code, _ = doJSONReq(t, h, http.MethodPost, "/actions/"+solana.PublicKey{20: 20}.String()+"/disclosure/submit", "{}", registrar)
	if code != http.StatusNotFound {
		t.Fatalf("unknown action submit = %d, want 404", code)
	}
	code, _ = doJSONReq(t, h, http.MethodPost, "/actions/not-a-pk/disclosure/submit", "{}", registrar)
	if code != http.StatusBadRequest {
		t.Fatalf("bad pda submit = %d, want 400", code)
	}
}

func TestMatchKaseSchedule(t *testing.T) {
	entries := []kase.ScheduleEntry{
		{RecordDate: "2007-05-28", Start: "2007-05-29", End: "2007-06-08", Rate: 850},
		{RecordDate: "2007-11-28", Start: "2007-11-29", End: "2007-12-11", Rate: 850},
	}
	if e, ok := matchKaseSchedule(entries, "2007-05-29", "2007-06-08", "2007-05-28"); !ok || e.RecordDate != "2007-05-28" {
		t.Fatalf("exact period = %+v ok=%v", e, ok)
	}
	// No containment: the row containing the record date wins.
	if e, ok := matchKaseSchedule(entries, "2007-06-15", "2007-11-28", "2007-11-15"); !ok || e.Start != "2007-11-29" && e.RecordDate != "2007-05-28" {
		t.Fatalf("record-date fallback = %+v ok=%v", e, ok)
	}
	if _, ok := matchKaseSchedule(nil, "2007-05-29", "2007-06-08", "2008-01-01"); ok {
		t.Fatal("empty schedule should not match")
	}
}
