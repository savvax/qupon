package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

type kycEnv struct {
	t      *testing.T
	srv    *httptest.Server
	st     *store.Store
	h      http.Handler
	svc    *auth.Service
	cliLog string
	dir    string
}

func newKycEnv(t *testing.T) *kycEnv {
	t.Helper()
	dir := t.TempDir()
	data, err := os.ReadFile("../executor/testdata/fake-cli.sh")
	if err != nil {
		t.Fatal(err)
	}
	bin := filepath.Join(dir, "fake-cli.sh")
	if err := os.WriteFile(bin, data, 0o755); err != nil {
		t.Fatal(err)
	}
	cfg := fmt.Sprintf(`{"programId":"P","series":{"QPNb1":{"mint":"%s"}}}`, fMint)
	if err := os.WriteFile(filepath.Join(dir, "exec.json"), []byte(cfg), 0o644); err != nil {
		t.Fatal(err)
	}
	st, err := store.Open(t.Context(), filepath.Join(dir, "kyc.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(50, time.Minute)}
	h := New(slog.New(slog.DiscardHandler), st, Deps{
		Executor: executor.New(bin, filepath.Join(dir, "exec.json"), nil),
		Auth:     svc,
		DataDir:  filepath.Join(dir, "data"),
	})
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	logPath := filepath.Join(dir, "cli.log")
	t.Setenv("FAKE_CLI_LOG", logPath)
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, dir, "ok.json", `{"ok":true,"signature":"sig","investor":"Inv","attestation":"Att"}`))
	return &kycEnv{t: t, srv: srv, st: st, h: h, svc: svc, cliLog: logPath, dir: dir}
}

// investor signs in a fresh self-registered investor with a linked wallet.
func (e *kycEnv) investor(email, wallet string) (string, int64) {
	e.t.Helper()
	hash, _ := auth.HashPassword("pw-123456789")
	id, err := e.st.UpsertUser(e.t.Context(), store.User{Email: email, Name: "Mira", Role: "investor"}, hash)
	if err != nil {
		e.t.Fatal(err)
	}
	if wallet != "" {
		if err := e.st.CreateWalletChallenge(e.t.Context(), store.WalletChallenge{Nonce: "n-" + email, UserID: id, Address: wallet, ExpiresAt: time.Now().Add(time.Hour).Unix()}); err != nil {
			e.t.Fatal(err)
		}
		if err := e.st.LinkWallet(e.t.Context(), "n-"+email, store.Wallet{Address: wallet, UserID: id, VerifiedAt: 1}); err != nil {
			e.t.Fatal(err)
		}
	}
	code, body := postJSON(e.t, e.srv.URL, "/auth/login", `{"email":"`+email+`","password":"pw-123456789"}`, "")
	if code != 200 {
		e.t.Fatalf("login %s: %d", email, code)
	}
	return body["token"].(string), id
}

func (e *kycEnv) upload(token, kind, filename string, content []byte) (int, map[string]any) {
	e.t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("kind", kind)
	fw, _ := mw.CreateFormFile("file", filename)
	_, _ = fw.Write(content)
	_ = mw.Close()
	req, _ := http.NewRequest(http.MethodPost, e.srv.URL+"/me/documents", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out
}

func (e *kycEnv) download(token string, id int64) (*http.Response, []byte) {
	e.t.Helper()
	req, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("%s/documents/%d", e.srv.URL, id), nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	b, _ := io.ReadAll(res.Body)
	return res, b
}

const wallet1 = "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo"

var pdf = []byte("%PDF-1.4\n% passport scan\n")

func TestDocumentsUploadAndAccess(t *testing.T) {
	e := newKycEnv(t)
	mira, _ := e.investor("mira@q.kz", wallet1)
	omar, _ := e.investor("omar@q.kz", "")

	code, out := e.upload(mira, "id_document", "../../etc/passport.pdf", pdf)
	if code != http.StatusCreated {
		t.Fatalf("upload: %d %v", code, out)
	}
	doc := out["document"].(map[string]any)
	id := int64(doc["id"].(float64))
	if doc["filename"] != "passport.pdf" || doc["mime"] != "application/pdf" {
		t.Fatalf("stored doc = %v", doc)
	}
	if code, out := e.upload(mira, "id_document", "evil.pdf", []byte("MZ\x90\x00 not a pdf")); code != 400 || out["code"] != "unsupported_type" {
		t.Fatalf("exe as pdf: %d %v", code, out)
	}
	if code, out := e.upload(mira, "selfie", "a.pdf", pdf); code != 400 || out["code"] != "invalid_params" {
		t.Fatalf("bad kind: %d %v", code, out)
	}

	res, body := e.download(mira, id)
	if res.StatusCode != 200 || !bytes.Equal(body, pdf) ||
		!strings.HasPrefix(res.Header.Get("Content-Disposition"), "attachment") ||
		res.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("owner download: %d %v", res.StatusCode, res.Header)
	}
	if res, _ := e.download(omar, id); res.StatusCode != http.StatusNotFound {
		t.Fatalf("another investor read the document: %d", res.StatusCode)
	}
	if res, _ := e.download("", id); res.StatusCode != http.StatusNotFound {
		t.Fatalf("anonymous read: %d", res.StatusCode)
	}
	reg := signIn(t, e.h, e.st, e.svc, "registrar")
	if res, _ := e.download(reg, id); res.StatusCode != 200 {
		t.Fatalf("registrar read: %d", res.StatusCode)
	}
}

func TestKycSubmitApproveReject(t *testing.T) {
	e := newKycEnv(t)
	mira, miraID := e.investor("mira@q.kz", wallet1)
	_, out := e.upload(mira, "id_document", "passport.pdf", pdf)
	docID := int64(out["document"].(map[string]any)["id"].(float64))
	body := func(wallet string) string {
		return fmt.Sprintf(`{"wallet":"%s","investorType":"individual","residency":"resident","taxBps":1000,"fullName":"Mira K","documentIds":[%d],"seriesMints":["%s"]}`, wallet, docID, fMint)
	}

	if code, out := postJSON(t, e.srv.URL, "/me/kyc", body("7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau"), mira); code != 400 || out["code"] != "wallet_not_linked" {
		t.Fatalf("unlinked wallet: %d %v", code, out)
	}
	code, out := postJSON(t, e.srv.URL, "/me/kyc", body(wallet1), mira)
	if code != http.StatusCreated {
		t.Fatalf("submit: %d %v", code, out)
	}
	appID := int64(out["application"].(map[string]any)["id"].(float64))
	if code, out := postJSON(t, e.srv.URL, "/me/kyc", body(wallet1), mira); code != http.StatusConflict || out["code"] != "kyc_pending" {
		t.Fatalf("second submit: %d %v", code, out)
	}

	// another investor cannot attach Mira's document
	omar, _ := e.investor("omar@q.kz", "6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cveB7xX5M9rdC")
	foreign := strings.Replace(body("6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cveB7xX5M9rdC"), "Mira K", "Omar", 1)
	if code, out := postJSON(t, e.srv.URL, "/me/kyc", foreign, omar); code != 400 || !strings.Contains(fmt.Sprint(out["message"]), "your own") {
		t.Fatalf("foreign document: %d %v", code, out)
	}

	reg := signIn(t, e.h, e.st, e.svc, "registrar")
	if code := doGet(t, e.h, "/registrar/kyc?status=submitted", mira); code != http.StatusForbidden {
		t.Fatalf("investor read the queue: %d", code)
	}
	code, out = postJSON(t, e.srv.URL, fmt.Sprintf("/registrar/kyc/%d/approve", appID), `{}`, reg)
	if code != 200 || out["status"] != "approved" {
		t.Fatalf("approve: %d %v", code, out)
	}
	lines := cliLogLines(t, e.cliLog)
	if len(lines) != 2 || !strings.Contains(lines[0], "kyc:attest --owner "+wallet1) || !strings.Contains(lines[1], "investor:register --series QPNb1 --owner "+wallet1) {
		t.Fatalf("cli calls = %q", lines)
	}
	a, err := e.st.LatestKyc(t.Context(), miraID)
	if err != nil || a.Status != "approved" || a.DecidedBy == nil {
		t.Fatalf("stored = %+v %v", a, err)
	}
	if code, out := postJSON(t, e.srv.URL, fmt.Sprintf("/registrar/kyc/%d/reject", appID), `{"reason":"late"}`, reg); code != http.StatusConflict || out["code"] != "kyc_decided" {
		t.Fatalf("reject after approve: %d %v", code, out)
	}
}

func TestKycApprovalFailureKeepsReview(t *testing.T) {
	e := newKycEnv(t)
	mira, miraID := e.investor("mira@q.kz", wallet1)
	_, out := e.upload(mira, "id_document", "passport.pdf", pdf)
	docID := int64(out["document"].(map[string]any)["id"].(float64))
	code, out := postJSON(t, e.srv.URL, "/me/kyc", fmt.Sprintf(`{"wallet":"%s","investorType":"individual","residency":"nonresident","taxBps":1500,"fullName":"Mira K","documentIds":[%d],"seriesMints":["%s"]}`, wallet1, docID, fMint), mira)
	if code != http.StatusCreated {
		t.Fatalf("submit: %d %v", code, out)
	}
	appID := int64(out["application"].(map[string]any)["id"].(float64))
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, e.dir, "fail.json", `{"ok":false,"error":"AttestationExpired"}`))
	reg := signIn(t, e.h, e.st, e.svc, "registrar")
	code, out = postJSON(t, e.srv.URL, fmt.Sprintf("/registrar/kyc/%d/approve", appID), `{}`, reg)
	if code != 200 || out["ok"] != false || out["status"] != "submitted" {
		t.Fatalf("failed approve: %d %v", code, out)
	}
	a, _ := e.st.LatestKyc(t.Context(), miraID)
	if a.Status != "submitted" || !strings.Contains(string(a.Results), "AttestationExpired") {
		t.Fatalf("results not kept: %+v", a)
	}
	code, out = postJSON(t, e.srv.URL, fmt.Sprintf("/registrar/kyc/%d/reject", appID), `{"reason":"Passport expired"}`, reg)
	if code != 200 || out["status"] != "rejected" {
		t.Fatalf("reject: %d %v", code, out)
	}
	code, out = doGetJSON(t, e.h, "/me/kyc", mira)
	app := out["application"].(map[string]any)
	if code != 200 || app["status"] != "rejected" || app["reason"] != "Passport expired" || len(app["documents"].([]any)) != 1 {
		t.Fatalf("my kyc: %d %v", code, out)
	}
}

func doGetJSON(t *testing.T, h http.Handler, path, token string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}
