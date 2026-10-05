package api

// Approval-gate and /schedule endpoints (task 024): the fake chain plays
// devnet, the fake CLI records argv; approve must execute the stored argv
// exactly once and mark the row executed.

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

func TestApprovalsListAndApprove(t *testing.T) {
	fc := &fakeChain{action: (&fakeRead{}).action()}
	dir := t.TempDir()
	srv, st, log := advanceServer(t, fc)
	t.Setenv("FAKE_CLI_STDOUT", writeT(t, dir, "ok.json", `{"ok":true,"signature":"sig-appr","slot":"77"}`))

	// Fresh queue: empty pending list.
	var list struct {
		Approvals []store.Approval `json:"approvals"`
	}
	getJSON(t, srv.URL+"/approvals", http.StatusOK, &list)
	if len(list.Approvals) != 0 {
		t.Fatalf("fresh approvals = %d, want 0", len(list.Approvals))
	}

	// A pending proposal (as the scheduler would insert it)…
	if err := st.InsertApproval(t.Context(), store.Approval{
		Ts: 1, DedupKey: "m|0|step:strike_record", SeriesMint: "m", ActionPDA: fAction.String(),
		Step: "step:strike_record", Args: []string{"action:strike", "--series", "QPNb1", "--index", "0"},
	}); err != nil {
		t.Fatalf("insert approval: %v", err)
	}
	// …deduped on re-propose.
	if err := st.InsertApproval(t.Context(), store.Approval{Ts: 2, DedupKey: "m|0|step:strike_record", SeriesMint: "m", Step: "dupe"}); err != nil {
		t.Fatalf("re-insert approval: %v", err)
	}
	var pending struct {
		Approvals []store.Approval `json:"approvals"`
	}
	getJSON(t, srv.URL+"/approvals", http.StatusOK, &pending)
	if len(pending.Approvals) != 1 || pending.Approvals[0].Step != "step:strike_record" {
		t.Fatalf("pending = %+v, want the deduped strike proposal", pending.Approvals)
	}

	// Approve: executes the stored argv, marks executed, records activity.
	r, err := http.Post(srv.URL+"/approvals/1/approve", "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatalf("approve: %v", err)
	}
	var out map[string]any
	if err := json.NewDecoder(r.Body).Decode(&out); err != nil {
		t.Fatalf("decode approve: %v", err)
	}
	_ = r.Body.Close()
	if r.StatusCode != http.StatusOK || out["ok"] != true || out["signature"] != "sig-appr" {
		t.Fatalf("approve = %d %v", r.StatusCode, out)
	}
	raw, _ := os.ReadFile(log)
	if want := "--json action:strike --series QPNb1 --index 0"; strings.TrimSpace(string(raw)) != want {
		t.Fatalf("cli log = %q, want %q", raw, want)
	}
	row, err := st.ApprovalByID(t.Context(), 1)
	if err != nil || row.Status != "executed" {
		t.Fatalf("approval after exec = %+v (%v), want executed", row, err)
	}
	events, _ := st.ListActivity(t.Context(), 10)
	if len(events) != 1 || events[0].Kind != "approval:step:strike_record" {
		t.Fatalf("activity = %+v, want one approval:step:strike_record row", events)
	}

	// Re-approving an executed row → 409; unknown id → 404; bad id → 400.
	for _, tc := range []struct {
		path string
		want int
	}{
		{"/approvals/1/approve", http.StatusConflict},
		{"/approvals/99/approve", http.StatusNotFound},
		{"/approvals/nope/approve", http.StatusBadRequest},
	} {
		resp, err := http.Post(srv.URL+tc.path, "application/json", strings.NewReader("{}"))
		if err != nil {
			t.Fatalf("post %s: %v", tc.path, err)
		}
		_ = resp.Body.Close()
		if resp.StatusCode != tc.want {
			t.Fatalf("post %s status = %d, want %d", tc.path, resp.StatusCode, tc.want)
		}
	}
	// Bad status filter → 400.
	getJSON(t, srv.URL+"/approvals?status=zzz", http.StatusBadRequest, nil)
}

func TestApproveCliRefusedStaysPending(t *testing.T) {
	fc := &fakeChain{action: (&fakeRead{}).action()}
	dir := t.TempDir()
	srv, st, _ := advanceServer(t, fc)
	t.Setenv("FAKE_CLI_EXIT", "1")
	t.Setenv("FAKE_CLI_STDERR", writeT(t, dir, "err.txt", "qupon: WrongStatus\n"))
	if err := st.InsertApproval(t.Context(), store.Approval{
		Ts: 1, DedupKey: "m|0|step:pay_batch", SeriesMint: "m", Step: "step:pay_batch",
		Args: []string{"action:pay", "--series", "QPNb1", "--index", "0"},
	}); err != nil {
		t.Fatalf("insert: %v", err)
	}

	r, err := http.Post(srv.URL+"/approvals/1/approve", "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatalf("approve: %v", err)
	}
	var out map[string]any
	_ = json.NewDecoder(r.Body).Decode(&out)
	_ = r.Body.Close()
	if r.StatusCode != http.StatusConflict || !strings.Contains(fmt.Sprint(out["error"]), "WrongStatus") {
		t.Fatalf("refused approve = %d %v, want 409 with the CLI message", r.StatusCode, out)
	}
	row, _ := st.ApprovalByID(t.Context(), 1)
	if row.Status != "pending" {
		t.Fatalf("status after refusal = %s, want pending (retryable)", row.Status)
	}
}

func TestApproveRequiresTokenWhenSet(t *testing.T) {
	fc := &fakeChain{action: (&fakeRead{}).action()}
	st, err := store.Open(t.Context(), filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	if err := st.InsertApproval(t.Context(), store.Approval{
		Ts: 1, DedupKey: "k", SeriesMint: "m", Step: "step:strike_record", Args: []string{"action:strike"},
	}); err != nil {
		t.Fatalf("insert: %v", err)
	}
	h := New(slog.New(slog.DiscardHandler), st, Deps{Read: fc, AdvanceToken: "s3cret"})
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/approvals/1/approve", strings.NewReader("{}"))
	req.Header.Set("Authorization", "Bearer wrong")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("post: %v", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("wrong token status = %d, want 401", resp.StatusCode)
	}
}

func TestScheduleEndpoint(t *testing.T) {
	srv := restServer(t, fakeRead{})

	var out struct {
		Series []struct {
			Mint   string         `json:"mint"`
			Ticker string         `json:"ticker"`
			Items  []ScheduleItem `json:"items"`
		} `json:"series"`
	}
	getJSON(t, srv.URL+"/schedule", http.StatusOK, &out)
	if len(out.Series) != 1 || out.Series[0].Ticker != "QPNb1" {
		t.Fatalf("series = %+v, want one QPNb1", out.Series)
	}
	// The fixture is a 2-year semi-annual bond → 4 coupons; its announced
	// action must be matched to its period (ActionPDA set, status Announced).
	if len(out.Series[0].Items) != 4 {
		t.Fatalf("items = %d, want 4", len(out.Series[0].Items))
	}
	announced := -1
	for i, item := range out.Series[0].Items {
		if item.ActionPDA != nil {
			announced = i
		}
	}
	if announced < 0 || out.Series[0].Items[announced].Status != "Announced" {
		t.Fatalf("no announced item found in %+v", out.Series[0].Items)
	}
}
