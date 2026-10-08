package api

// Approval-gate and /schedule endpoints (task 024): the fake chain plays
// devnet, the fake CLI records argv; approve must execute the stored argv
// exactly once and mark the row executed.

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/auth"
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

// TestApproveConcurrentRunsCliOnce: the claim (pending→running) runs before
// the CLI, so two parallel approve clicks execute the argv exactly once;
// the loser gets a 409.
func TestApproveConcurrentRunsCliOnce(t *testing.T) {
	fc := &fakeChain{action: (&fakeRead{}).action()}
	srv, st, log := advanceServer(t, fc)
	t.Setenv("FAKE_CLI_SLEEP", "1") // hold the winner so the loser overlaps it
	if err := st.InsertApproval(t.Context(), store.Approval{
		Ts: 1, DedupKey: "m|0|step:strike_record", SeriesMint: "m", Step: "step:strike_record",
		Args: []string{"action:strike", "--series", "QPNb1", "--index", "0"},
	}); err != nil {
		t.Fatalf("insert: %v", err)
	}

	codeCh := make(chan int, 2)
	for range 2 {
		go func() {
			resp, err := http.Post(srv.URL+"/approvals/1/approve", "application/json", strings.NewReader("{}"))
			if err != nil {
				codeCh <- 0
				return
			}
			_ = resp.Body.Close()
			codeCh <- resp.StatusCode
		}()
	}
	a, b := <-codeCh, <-codeCh
	if (a == http.StatusOK) == (b == http.StatusOK) {
		t.Fatalf("parallel approves = %d/%d, want exactly one 200", a, b)
	}
	if got := cliLines(t, log); len(got) != 1 {
		t.Fatalf("cli ran %d times, want 1 (%v)", len(got), got)
	}
	row, err := st.ApprovalByID(t.Context(), 1)
	if err != nil || row.Status != "executed" {
		t.Fatalf("approval = %s (%v), want executed", row.Status, err)
	}
}

// TestRejectApproval: registrar role rejects a pending proposal (nothing
// executes); other roles 403; double reject and non-pending 409; 404/400 ids.
func TestRejectApproval(t *testing.T) {
	fc := &fakeChain{action: (&fakeRead{}).action()}
	srv, st, log := advanceServer(t, fc)
	// A second auth service over the same store mints a wrong-role token.
	issuer := roleToken(t, st, &auth.Service{Store: st, Now: time.Now, TTL: time.Hour, Limit: auth.NewLimiter(5, time.Minute)}, "issuer")
	if err := st.InsertApproval(t.Context(), store.Approval{
		Ts: 1, DedupKey: "m|0|step:pay_batch", SeriesMint: "m", Step: "step:pay_batch",
		Args: []string{"action:pay", "--series", "QPNb1", "--index", "0"},
	}); err != nil {
		t.Fatalf("insert: %v", err)
	}

	// Wrong role → 403, row untouched.
	if code, _ := postJSON(t, srv.URL, "/registrar/approvals/1/reject", "{}", issuer); code != http.StatusForbidden {
		t.Fatalf("issuer reject = %d, want 403", code)
	}
	row, _ := st.ApprovalByID(t.Context(), 1)
	if row.Status != "pending" {
		t.Fatalf("status after forbidden reject = %s, want pending", row.Status)
	}

	// Registrar rejects → 200, status rejected, nothing executed.
	code, out := postJSON(t, srv.URL, "/registrar/approvals/1/reject", "{}", "")
	if code != http.StatusOK || out["status"] != "rejected" {
		t.Fatalf("reject = %d %v, want 200 rejected", code, out)
	}
	row, _ = st.ApprovalByID(t.Context(), 1)
	if row.Status != "rejected" {
		t.Fatalf("status after reject = %s, want rejected", row.Status)
	}
	if got := cliLines(t, log); len(got) != 0 {
		t.Fatalf("cli log = %q, want no execution on reject", got)
	}

	for _, tc := range []struct {
		path string
		want int
	}{
		{"/registrar/approvals/1/reject", http.StatusConflict}, // already rejected
		{"/registrar/approvals/99/reject", http.StatusNotFound},
		{"/registrar/approvals/nope/reject", http.StatusBadRequest},
	} {
		if code, _ := postJSON(t, srv.URL, tc.path, "{}", ""); code != tc.want {
			t.Fatalf("post %s = %d, want %d", tc.path, code, tc.want)
		}
	}
	// Rejected rows are visible through the status filter.
	var list struct {
		Approvals []store.Approval `json:"approvals"`
	}
	getJSON(t, srv.URL+"/approvals?status=rejected", http.StatusOK, &list)
	if len(list.Approvals) != 1 || list.Approvals[0].Status != "rejected" {
		t.Fatalf("rejected list = %+v, want the one rejected row", list.Approvals)
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
