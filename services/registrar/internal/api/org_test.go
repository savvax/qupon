package api

// Task 807: organisation profile, team invites, series documents and the issuerOwnsSeries
// access boundary — another organisation's issuer gets 403 not_your_series, invites are
// single-use, attached documents are public.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

type orgEnv struct {
	t       *testing.T
	srv     *httptest.Server
	st      *store.Store
	svc     *auth.Service
	dir     string
	orgA    int64
	orgB    int64
	issuerA string
	issuerB string
	admin   string
}

func newOrgEnv(t *testing.T) *orgEnv {
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
	st, err := store.Open(t.Context(), filepath.Join(dir, "org.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	a, err := st.CreateOrganization(t.Context(), store.Organization{Name: "KazIron JSC", Kind: "issuer", BIN: "123456789012", Website: "https://kaziron.kz"})
	if err != nil {
		t.Fatal(err)
	}
	b, err := st.CreateOrganization(t.Context(), store.Organization{Name: "Steppe Power JSC", Kind: "issuer"})
	if err != nil {
		t.Fatal(err)
	}
	svc := &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(50, time.Minute)}
	h := New(slog.New(slog.DiscardHandler), st, Deps{
		Read:     &fakeChain{action: &chain.CorporateAction{Series: fSeries, Index: 3, Status: 2}},
		Executor: executor.New(bin, filepath.Join(dir, "exec.json"), nil),
		Auth:     svc,
		DataDir:  filepath.Join(dir, "data"),
	})
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	login := func(email string, org *int64, role string) string {
		t.Helper()
		hash, _ := auth.HashPassword("pw-" + email)
		if _, err := st.UpsertUser(t.Context(), store.User{Email: email, Name: email, Role: role, OrgID: org}, hash); err != nil {
			t.Fatal(err)
		}
		id, _, err := st.UserByEmail(t.Context(), email)
		if err != nil || org != nil {
			if err := st.SetUserOrg(t.Context(), id.ID, org); err != nil {
				t.Fatal(err)
			}
		}
		code, out := postJSON(t, srv.URL, "/auth/login", `{"email":"`+email+`","password":"pw-`+email+`"}`, "")
		if code != 200 {
			t.Fatalf("login %s: %d", email, code)
		}
		return out["token"].(string)
	}
	return &orgEnv{t: t, srv: srv, st: st, svc: svc, dir: dir, orgA: a.ID, orgB: b.ID,
		issuerA: login("a@kaziron.kz", &a.ID, "issuer"),
		issuerB: login("b@steppe.kz", &b.ID, "issuer"),
		admin:   login("root@qupon.kz", nil, "admin")}
}

func (e *orgEnv) upload(token, kind string) (int64, map[string]any) {
	e.t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("kind", kind)
	fw, _ := mw.CreateFormFile("file", "prospectus.pdf")
	_, _ = fw.Write(pdf)
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
	doc, _ := out["document"].(map[string]any)
	var id int64
	if doc != nil {
		id = int64(doc["id"].(float64))
	}
	return id, out
}

func TestIssuerSeriesScoping(t *testing.T) {
	e := newOrgEnv(t)
	if err := e.st.SetSeriesOrg(t.Context(), fMint.String(), &e.orgA); err != nil {
		t.Fatal(err)
	}
	actions := "/issuer/series/" + fMint.String() + "/actions"
	body := `{"kind":"INTR","recordAt":100,"paymentAt":200}`
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, e.dir, "ok.json", `{"ok":true,"action":"Act1","signatures":["sa1"]}`))

	// Another organisation's issuer: 403 not_your_series, nothing executed.
	if code, out := postJSON(t, e.srv.URL, actions, body, e.issuerB); code != http.StatusForbidden || out["code"] != "not_your_series" {
		t.Fatalf("foreign issuer: %d %v, want 403 not_your_series", code, out)
	}
	// The owning organisation's issuer and an admin both pass.
	if code, out := postJSON(t, e.srv.URL, actions, body, e.issuerA); code != http.StatusCreated || out["action"] != "Act1" {
		t.Fatalf("owning issuer: %d %v, want 201", code, out)
	}
	if code, _ := postJSON(t, e.srv.URL, actions, body, e.admin); code != http.StatusCreated {
		t.Fatalf("admin bypass: %d, want 201", code)
	}
	// The action-scoped route is checked too: /issuer/actions/{pda}/fund resolves fAction → fMint → org A.
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, e.dir, "fund.json", `{"ok":true,"signature":"sig-fund"}`))
	fund := "/issuer/actions/" + fAction.String() + "/fund"
	if code, out := postJSON(t, e.srv.URL, fund, "{}", e.issuerB); code != http.StatusForbidden || out["code"] != "not_your_series" {
		t.Fatalf("foreign fund: %d %v, want 403 not_your_series", code, out)
	}
	if code, _ := postJSON(t, e.srv.URL, fund, "{}", e.issuerA); code != http.StatusOK {
		t.Fatalf("owning fund: %d, want 200", code)
	}
	// An issuer without an organisation cannot touch an owned series.
	noOrg := signIn(t, New(slog.New(slog.DiscardHandler), e.st, Deps{Auth: e.svc}), e.st, e.svc, "issuer")
	if code, out := postJSON(t, e.srv.URL, actions, body, noOrg); code != http.StatusForbidden || out["code"] != "not_your_series" {
		t.Fatalf("orgless issuer: %d %v, want 403 not_your_series", code, out)
	}
}

func TestOrgProfileAndMembers(t *testing.T) {
	e := newOrgEnv(t)

	req, _ := http.NewRequest(http.MethodGet, e.srv.URL+"/org", nil)
	req.Header.Set("Authorization", "Bearer "+e.issuerA)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	_ = res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatalf("GET /org: %d %v", res.StatusCode, out)
	}
	org := out["organization"].(map[string]any)
	if org["name"] != "KazIron JSC" || org["bin"] != "123456789012" {
		t.Fatalf("org = %v", org)
	}

	// PATCH updates the mutable profile fields.
	code, out2 := patchJSON(t, e.srv.URL, "/org", `{"name":"KazIron Group JSC","website":"https://group.kz"}`, e.issuerA)
	if code != 200 || out2["organization"].(map[string]any)["name"] != "KazIron Group JSC" {
		t.Fatalf("patch org: %d %v", code, out2)
	}
	if code, out2 := patchJSON(t, e.srv.URL, "/org", `{"name":"x"}`, e.issuerA); code != http.StatusBadRequest || out2["code"] != "invalid_params" {
		t.Fatalf("short name: %d %v", code, out2)
	}

	// A website without an http(s) scheme is refused: the value is rendered as a link
	// in the admin console (task 1419).
	if code, out2 := patchJSON(t, e.srv.URL, "/org", `{"website":"javascript:alert(1)"}`, e.issuerA); code != http.StatusBadRequest || out2["code"] != "invalid_params" {
		t.Fatalf("website scheme: %d %v", code, out2)
	}
	if code, out2 := patchJSON(t, e.srv.URL, "/org", `{"website":""}`, e.issuerA); code != http.StatusOK {
		t.Fatalf("empty website clears: %d %v", code, out2)
	}
	// A legacy stored website without a scheme does not block other edits (task 1424).
	legacy, err := e.st.GetOrganization(t.Context(), e.orgA)
	if err != nil {
		t.Fatal(err)
	}
	legacy.Website = "kaziron.kz"
	if err := e.st.UpdateOrganization(t.Context(), legacy); err != nil {
		t.Fatal(err)
	}
	if code, out2 := patchJSON(t, e.srv.URL, "/org", `{"name":"KazIron Holding JSC"}`, e.issuerA); code != http.StatusOK {
		t.Fatalf("name change with a legacy website: %d %v", code, out2)
	}

	// Members: the issuer sees their organisation only.
	code, out2 = getJSONAuth(t, e.srv.URL, "/org/members", e.issuerA)
	if code != 200 {
		t.Fatalf("members: %d", code)
	}
	members := out2["members"].([]any)
	if len(members) != 1 || members[0].(map[string]any)["email"] != "a@kaziron.kz" {
		t.Fatalf("members = %v", members)
	}

	// A user without an organisation has nothing to read or write here.
	hash, _ := auth.HashPassword("pw-plain-investor")
	if _, err := e.st.UpsertUser(t.Context(), store.User{Email: "inv@q.kz", Name: "Inv", Role: "investor"}, hash); err != nil {
		t.Fatal(err)
	}
	_, out3 := postJSON(t, e.srv.URL, "/auth/login", `{"email":"inv@q.kz","password":"pw-plain-investor"}`, "")
	inv := out3["token"].(string)
	if code, out3 := getJSONAuth(t, e.srv.URL, "/org", inv); code != http.StatusNotFound || out3["code"] != "no_org" {
		t.Fatalf("investor /org: %d %v, want 404 no_org", code, out3)
	}
}

// URL schemes are case-insensitive (RFC 3986 §3.1): HTTPS://example.kz is accepted,
// javascript: in any case is refused (task 1423).
func TestValidWebsite(t *testing.T) {
	for w, ok := range map[string]bool{
		"":                    true,
		"https://example.kz":  true,
		"HTTPS://example.kz":  true,
		"Http://example.kz":   true,
		"javascript:alert(1)": false,
		"JavaScript:alert(1)": false,
		"data:text/html,x":    false,
		"example.kz":          false,
	} {
		if got := validWebsite(w); got != ok {
			t.Errorf("validWebsite(%q) = %v, want %v", w, got, ok)
		}
	}
}
func TestInviteSingleUse(t *testing.T) {
	e := newOrgEnv(t)

	code, out := postJSON(t, e.srv.URL, "/org/invites", `{"email":"New.Colleague@Kaziron.KZ","role":"issuer"}`, e.issuerA)
	if code != http.StatusCreated || out["url"] == "" {
		t.Fatalf("invite: %d %v", code, out)
	}
	token := strings.TrimPrefix(out["url"].(string), "/invite/")
	if strings.Contains(token, "/") { // PUBLIC_URL unset → a relative link
		token = token[strings.LastIndex(token, "/")+1:]
	}
	if code, out := postJSON(t, e.srv.URL, "/org/invites", `{"email":"bad","role":"issuer"}`, e.issuerA); code != http.StatusBadRequest || out["code"] != "invalid_params" {
		t.Fatalf("bad email: %d %v", code, out)
	}
	if code, out := postJSON(t, e.srv.URL, "/org/invites", `{"email":"ok@kz","role":"admin"}`, e.issuerA); code != http.StatusBadRequest {
		t.Fatalf("role must be issuer: %d %v", code, out)
	}

	accept := `{"token":"` + token + `","name":"Nurdan","password":"steppe-bonds-2026"}`
	code, out = postJSON(t, e.srv.URL, "/auth/invite/accept", accept, "")
	if code != 200 || out["token"] == "" {
		t.Fatalf("accept: %d %v", code, out)
	}
	u := out["user"].(map[string]any)
	if u["role"] != "issuer" || u["orgId"].(float64) != float64(e.orgA) || u["email"] != "new.colleague@kaziron.kz" {
		t.Fatalf("accepted user = %v", u)
	}
	// The member list now shows the colleague.
	_, out = getJSONAuth(t, e.srv.URL, "/org/members", e.issuerA)
	if len(out["members"].([]any)) != 2 {
		t.Fatalf("members after accept = %v", out["members"])
	}

	// Single use: the second accept fails, and so does an expired token.
	if code, out := postJSON(t, e.srv.URL, "/auth/invite/accept", accept, ""); code != http.StatusBadRequest || out["code"] != "invalid_token" {
		t.Fatalf("reuse: %d %v, want 400 invalid_token", code, out)
	}
	expired := "exp" + strings.Repeat("x", 40)
	_ = e.st.CreateInvite(t.Context(), auth.HashToken(expired), e.orgA, "issuer", "late@kz", time.Now().Add(-time.Hour).Unix(), 1)
	if code, out := postJSON(t, e.srv.URL, "/auth/invite/accept", `{"token":"`+expired+`","name":"Late","password":"steppe-bonds-2026"}`, ""); code != http.StatusBadRequest || out["code"] != "invalid_token" {
		t.Fatalf("expired: %d %v, want 400 invalid_token", code, out)
	}

	// Removing a member detaches them; removing yourself is refused.
	colleagueID := int64(u["id"].(float64))
	if code, out := doDeleteJSON(t, e.srv.URL, fmt.Sprintf("/org/members/%d", colleagueID), e.issuerA); code != http.StatusOK || out["ok"] != true {
		t.Fatalf("remove member: %d %v", code, out)
	}
	_, out = getJSONAuth(t, e.srv.URL, "/org/members", e.issuerA)
	if len(out["members"].([]any)) != 1 {
		t.Fatalf("members after removal = %v", out["members"])
	}
	self, _, _ := e.st.UserByEmail(t.Context(), "a@kaziron.kz")
	if code, out := doDeleteJSON(t, e.srv.URL, fmt.Sprintf("/org/members/%d", self.ID), e.issuerA); code != http.StatusBadRequest || out["code"] != "self_removal" {
		t.Fatalf("self removal: %d %v", code, out)
	}
}

func TestSeriesDocuments(t *testing.T) {
	e := newOrgEnv(t)
	docID, out := e.upload(e.issuerA, "other")
	if docID == 0 {
		t.Fatalf("upload: %v", out)
	}
	attach := "/issuer/series/" + fMint.String() + "/documents"

	// Foreign uploads cannot be published; bad kinds are rejected.
	foreignID, _ := e.upload(e.issuerB, "other")
	if code, out := postJSON(t, e.srv.URL, attach, fmt.Sprintf(`{"documentId":%d,"kind":"prospectus"}`, foreignID), e.issuerA); code != http.StatusBadRequest {
		t.Fatalf("foreign document: %d %v, want 400", code, out)
	}
	if code, out := postJSON(t, e.srv.URL, attach, fmt.Sprintf(`{"documentId":%d,"kind":"id_document"}`, docID), e.issuerA); code != http.StatusBadRequest || out["code"] != "invalid_params" {
		t.Fatalf("personal kind: %d %v", code, out)
	}

	code, out := postJSON(t, e.srv.URL, attach, fmt.Sprintf(`{"documentId":%d,"kind":"prospectus"}`, docID), e.issuerA)
	if code != http.StatusCreated {
		t.Fatalf("attach: %d %v", code, out)
	}
	doc := out["document"].(map[string]any)
	if doc["kind"] != "prospectus" || doc["seriesMint"] != fMint.String() {
		t.Fatalf("attached = %v", doc)
	}

	// The public list shows it; the registrar may not be blocked by a missing session.
	req, _ := http.NewRequest(http.MethodGet, e.srv.URL+"/series/"+fMint.String()+"/documents", nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	var list map[string]any
	_ = json.NewDecoder(res.Body).Decode(&list)
	if res.StatusCode != 200 || len(list["documents"].([]any)) != 1 {
		t.Fatalf("public list: %d %v", res.StatusCode, list)
	}
	// Anonymous download works for attached documents (public), and the personal upload stays private.
	dl, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("%s/documents/%d", e.srv.URL, docID), nil)
	dres, _ := http.DefaultClient.Do(dl)
	if dres == nil || dres.StatusCode != 200 || dres.Header.Get("X-Content-Type-Options") != "nosniff" {
		if dres != nil {
			t.Fatalf("public download: %d %v", dres.StatusCode, dres.Header)
		}
		t.Fatal("public download failed")
	}
	_ = dres.Body.Close()
	privateID, _ := e.upload(e.issuerB, "other")
	dl2, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("%s/documents/%d", e.srv.URL, privateID), nil)
	dres2, _ := http.DefaultClient.Do(dl2)
	if dres2 == nil || dres2.StatusCode != http.StatusNotFound {
		t.Fatalf("private download: %v", dres2)
	}
	_ = dres2.Body.Close()
}

// Task 1404: attaching rewrites the kind and publishes the file, so a colleague's KYC document
// must not be attachable — not even by a member of the same organisation, not even its owner.
func TestPersonalDocumentsNotPublishable(t *testing.T) {
	e := newOrgEnv(t)

	// A second issuer in organisation A (a colleague of issuerA).
	hash, _ := auth.HashPassword("pw-mate@kaziron.kz")
	if _, err := e.st.UpsertUser(t.Context(), store.User{Email: "mate@kaziron.kz", Name: "Mate", Role: "issuer"}, hash); err != nil {
		t.Fatal(err)
	}
	mate, _, err := e.st.UserByEmail(t.Context(), "mate@kaziron.kz")
	if err != nil {
		t.Fatal(err)
	}
	if err := e.st.SetUserOrg(t.Context(), mate.ID, &e.orgA); err != nil {
		t.Fatal(err)
	}
	_, out := postJSON(t, e.srv.URL, "/auth/login", `{"email":"mate@kaziron.kz","password":"pw-mate@kaziron.kz"}`, "")
	mateTok := out["token"].(string)

	docID, out := e.upload(e.issuerA, "id_document")
	if docID == 0 {
		t.Fatalf("upload: %v", out)
	}
	attach := "/issuer/series/" + fMint.String() + "/documents"
	body := fmt.Sprintf(`{"documentId":%d,"kind":"prospectus"}`, docID)
	if code, out := postJSON(t, e.srv.URL, attach, body, mateTok); code != http.StatusBadRequest {
		t.Fatalf("colleague attaches id_document: %d %v, want 400", code, out)
	}
	if code, out := postJSON(t, e.srv.URL, attach, body, e.issuerA); code != http.StatusBadRequest {
		t.Fatalf("owner attaches id_document: %d %v, want 400", code, out)
	}
	// The document stays private: an anonymous download answers 404.
	dl, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("%s/documents/%d", e.srv.URL, docID), nil)
	res, err := http.DefaultClient.Do(dl)
	if err != nil {
		t.Fatal(err)
	}
	_ = res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("anonymous download: %d, want 404", res.StatusCode)
	}
}

// flakyChain errors on the first FetchCorporateAction calls, then delegates (task 1404).
type flakyChain struct {
	*fakeChain
	fails int
}

func (f *flakyChain) FetchCorporateAction(ctx context.Context, pda solana.PublicKey) (*chain.CorporateAction, error) {
	if f.fails > 0 {
		f.fails--
		return nil, errors.New("rpc unavailable")
	}
	return f.fakeChain.FetchCorporateAction(ctx, pda)
}

// Task 1404: a chain read error inside issuerOwnsSeries must fail closed — a foreign issuer's
// fund call gets 502 (or 403), never a silently-passed 200.
func TestIssuerScopingFailsClosedOnChainReadError(t *testing.T) {
	e := newOrgEnv(t)
	if err := e.st.SetSeriesOrg(t.Context(), fMint.String(), &e.orgA); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(New(slog.New(slog.DiscardHandler), e.st, Deps{
		Read:     &flakyChain{fakeChain: &fakeChain{action: &chain.CorporateAction{Series: fSeries, Index: 3, Status: 2}}, fails: 1},
		Executor: executor.New(filepath.Join(e.dir, "fake-cli.sh"), filepath.Join(e.dir, "exec.json"), nil),
		Auth:     e.svc,
	}))
	t.Cleanup(srv.Close)

	fund := "/issuer/actions/" + fAction.String() + "/fund"
	code, out := postJSON(t, srv.URL, fund, "{}", e.issuerB)
	if code != http.StatusBadGateway && code != http.StatusForbidden {
		t.Fatalf("foreign issuer, read error: %d %v, want 502 or 403 (never 200)", code, out)
	}
}

func patchJSON(t *testing.T, url, path, body, token string) (int, map[string]any) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPatch, url+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out
}

func getJSONAuth(t *testing.T, url, path, token string) (int, map[string]any) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, url+path, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out
}

func doDeleteJSON(t *testing.T, url, path, token string) (int, map[string]any) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodDelete, url+path, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = res.Body.Close() }()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out
}
