package executor

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
)

// fakeCLI copies testdata/fake-cli.sh into a temp dir with the exec bit set
// (git checkouts on some platforms lose it) and returns its path.
func fakeCLI(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	bin := filepath.Join(dir, "fake-cli.sh")
	data, err := os.ReadFile("testdata/fake-cli.sh")
	if err != nil {
		t.Fatalf("read fake cli: %v", err)
	}
	if err := os.WriteFile(bin, data, 0o755); err != nil {
		t.Fatalf("write fake cli: %v", err)
	}
	return bin
}

func writeFile(t *testing.T, dir, name, content string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return p
}

func TestRunSuccess(t *testing.T) {
	dir := t.TempDir()
	stdout := writeFile(t, dir, "out.json", `{"ok":true,"signature":"sig123","slot":"314159"}`+"\n")
	t.Setenv("FAKE_CLI_STDOUT", stdout)
	e := New(fakeCLI(t), "testdata/devnet.json", nil)

	res, err := e.Run(t.Context(), "action:strike", "--series", "QPNb1", "--index", "1")
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if !res.OK || res.Signature != "sig123" || uint64(res.Slot) != 314159 {
		t.Fatalf("res = %+v, want ok sig123 slot 314159", res)
	}
}

func TestRunSuccessNumericSlot(t *testing.T) {
	dir := t.TempDir()
	stdout := writeFile(t, dir, "out.json", `{"ok":true,"signature":"s","slot":99}`)
	t.Setenv("FAKE_CLI_STDOUT", stdout)
	e := New(fakeCLI(t), "testdata/devnet.json", nil)

	res, err := e.Run(t.Context(), "action:pay", "--series", "QPNb1")
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if uint64(res.Slot) != 99 {
		t.Fatalf("slot = %d, want 99 (numbers and strings both parse)", res.Slot)
	}
}

func TestRunCliFailure(t *testing.T) {
	dir := t.TempDir()
	stderr := writeFile(t, dir, "err.txt", "sending tx\nqupon: WrongStatus: action is not Announced\n")
	t.Setenv("FAKE_CLI_STDERR", stderr)
	t.Setenv("FAKE_CLI_EXIT", "1")
	e := New(fakeCLI(t), "testdata/devnet.json", nil)

	res, err := e.Run(t.Context(), "action:strike", "--series", "QPNb1")
	if err != nil {
		t.Fatalf("a failed step is data, not a Go error: %v", err)
	}
	if res.OK {
		t.Fatalf("res.OK = true, want false")
	}
	if !strings.Contains(res.Error, "WrongStatus") {
		t.Fatalf("error = %q, want the CLI message (last stderr line)", res.Error)
	}
}

// The sweep CLI reports an already-swept escrow as a skip-reason string, not a bool.
func TestRunSkipReasonString(t *testing.T) {
	dir := t.TempDir()
	stdout := writeFile(t, dir, "out.json", `{"ok":true,"skipped":"already swept"}`)
	t.Setenv("FAKE_CLI_STDOUT", stdout)
	res, err := New(fakeCLI(t), "testdata/devnet.json", nil).Run(t.Context(), "action:sweep", "--series", "QPNb1", "--index", "1")
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if !res.OK || !bool(res.Skipped) {
		t.Fatalf("res = %+v, want ok with skipped=true (reason string)", res)
	}
}

func TestRunCliFailureJsonError(t *testing.T) {
	dir := t.TempDir()
	stdout := writeFile(t, dir, "out.json", `{"ok":false,"error":"TooEarly: record date not reached"}`)
	t.Setenv("FAKE_CLI_STDOUT", stdout)
	t.Setenv("FAKE_CLI_EXIT", "1")
	e := New(fakeCLI(t), "testdata/devnet.json", nil)

	res, err := e.Run(t.Context(), "action:strike")
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if res.OK || res.Error != "TooEarly: record date not reached" {
		t.Fatalf("res = %+v, want ok:false with the JSON error", res)
	}
}

// Task 91583: a completed CLI step fires OnStepDone — main.go wires it to
// chain.Client.InvalidateProgramAccounts so cached program-account scans never
// go stale after a write. This test composes both sides against a fake RPC.
func TestStepDoneInvalidatesScanCache(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": []any{}})
	}))
	defer srv.Close()
	program, err := solana.PublicKeyFromBase58("QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd")
	if err != nil {
		t.Fatal(err)
	}
	cl := chain.NewClient(srv.URL, program, slog.New(slog.DiscardHandler))

	dir := t.TempDir()
	stdout := writeFile(t, dir, "out.json", `{"ok":true,"signature":"sig","slot":1}`+"\n")
	t.Setenv("FAKE_CLI_STDOUT", stdout)
	e := New(fakeCLI(t), "testdata/devnet.json", nil)
	e.OnStepDone = cl.InvalidateProgramAccounts

	scan := func() {
		disc, derr := chain.AccountDiscriminator("Series")
		if derr != nil {
			t.Fatal(derr)
		}
		if _, err := cl.GetProgramAccounts(t.Context(), disc, nil); err != nil {
			t.Fatalf("GetProgramAccounts: %v", err)
		}
	}
	scan() // primes the cache
	if _, err := e.Run(t.Context(), "action:strike", "--series", "QPNb1", "--index", "1"); err != nil {
		t.Fatalf("run: %v", err)
	}
	scan() // must hit the RPC again: the step invalidated the cache
	if n := calls.Load(); n != 2 {
		t.Errorf("rpc calls = %d, want 2 (cache invalidated after the executor step)", n)
	}
}

func TestRunTimeout(t *testing.T) {
	dir := t.TempDir()
	// sleep is a grandchild that holds stdout open (like node under the pnpm bin shim).
	slow := writeFile(t, dir, "slow.sh", "#!/bin/sh\nsleep 5\necho '{}'\n")
	if err := os.Chmod(slow, 0o755); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	e := New(slow, "testdata/devnet.json", nil)
	e.timeout = 100 * time.Millisecond

	start := time.Now()
	if _, err := e.Run(t.Context(), "action:pay"); err == nil {
		t.Fatalf("want timeout error")
	} else if !strings.Contains(err.Error(), "timed out") {
		t.Fatalf("err = %v, want timeout", err)
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("run took %s, the per-executor cap must apply", elapsed)
	}
}

// A cancelled parent (client disconnect, shutdown) must not be reported as a
// timeout: only DeadlineExceeded is "timed out" (task 1406).
func TestRunParentCancelIsNotATimeout(t *testing.T) {
	dir := t.TempDir()
	slow := writeFile(t, dir, "slow.sh", "#!/bin/sh\nsleep 5\necho '{}'\n")
	if err := os.Chmod(slow, 0o755); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	e := New(slow, "testdata/devnet.json", nil)
	e.timeout = 10 * time.Second

	ctx, cancel := context.WithCancel(t.Context())
	time.AfterFunc(50*time.Millisecond, cancel)
	_, err := e.Run(ctx, "action:pay")
	if err == nil {
		return // the run survived the cancellation and completed — also fine
	}
	if strings.Contains(err.Error(), "timed out") {
		t.Fatalf("err = %v, a cancelled parent is not a timeout", err)
	}
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
}

func TestRunBadContract(t *testing.T) {
	dir := t.TempDir()
	stdout := writeFile(t, dir, "out.json", "not json at all")
	t.Setenv("FAKE_CLI_STDOUT", stdout)
	e := New(fakeCLI(t), "testdata/devnet.json", nil)

	if _, err := e.Run(t.Context(), "action:pay"); err == nil {
		t.Fatalf("exit 0 with non-JSON stdout is a contract violation, want error")
	}
}

func TestSeriesName(t *testing.T) {
	e := New("qupon", "testdata/devnet.json", nil)
	name, err := e.SeriesName("6KPAMhmAZ25A62PvXSUjvLHiiqxu3hS7ey5CJB2zmtj2")
	if err != nil || name != "QPNb1" {
		t.Fatalf("name = %q err = %v, want QPNb1", name, err)
	}
	if _, err := e.SeriesName("NotAMint1111111111111111111111111111111111"); err == nil {
		t.Fatalf("unknown mint must error")
	}
	if _, err := New("qupon", filepath.Join(t.TempDir(), "missing.json"), nil).SeriesName("x"); err == nil {
		t.Fatalf("missing config must error")
	}
}

func TestArgs(t *testing.T) {
	got, err := Args(StepFund, "QPNb1", 2)
	if err != nil {
		t.Fatalf("args: %v", err)
	}
	want := `action:fund --series QPNb1 --index 2`
	if strings.Join(got, " ") != want {
		t.Fatalf("args = %q, want %q", strings.Join(got, " "), want)
	}
	if _, err := Args("nonsense", "QPNb1", 1); err == nil {
		t.Fatalf("unknown step must error")
	}
}

func TestNextStep(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	later := now.Add(time.Hour)
	tests := []struct {
		name       string
		action     chain.CorporateAction
		supply     uint64
		series     chain.Series
		now        time.Time
		autofund   bool
		wantStep   string
		wantWaitIn string // "" → wantStep; otherwise wait reason contains this
	}{
		{name: "announced strikes", action: chain.CorporateAction{Status: 0},
			wantStep: StepStrike},
		{name: "announced with open trades waits", action: chain.CorporateAction{Status: 0},
			series: chain.Series{OpenTrades: 2}, wantWaitIn: "open secondary trades: settle or cancel them first (2)"},
		// only the strike is gated: once the record is struck the count cannot be non-zero, and must not stall the rest
		{name: "open trades do not gate later steps", action: chain.CorporateAction{Status: 3},
			series: chain.Series{OpenTrades: 1}, wantStep: StepPay},
		{name: "record struck snapshots holders", action: chain.CorporateAction{Status: 1, HoldersSnapshotted: 1, UnitsSnapshotted: 10},
			supply: 100, wantStep: StepSnapshot},
		{name: "record struck with every unit snapshotted finalizes", action: chain.CorporateAction{Status: 1, HoldersSnapshotted: 3, UnitsSnapshotted: 100},
			supply: 100, wantStep: StepFinalize},
		// regression: a registered investor holding 0 bonds is never snapshotted; it must not block finalize
		{name: "zero-balance investor does not block finalize", action: chain.CorporateAction{Status: 1, HoldersSnapshotted: 3, UnitsSnapshotted: 101},
			supply: 101, wantStep: StepFinalize},
		{name: "record struck with no bonds outstanding waits", action: chain.CorporateAction{Status: 1},
			supply: 0, wantWaitIn: "nothing to snapshot"},
		{name: "snapshot complete waits for issuer", action: chain.CorporateAction{Status: 2},
			wantWaitIn: "autofund"},
		{name: "snapshot complete autofunds", action: chain.CorporateAction{Status: 2},
			autofund: true, wantStep: StepFund},
		{name: "funded pays", action: chain.CorporateAction{Status: 3},
			wantStep: StepPay},
		{name: "settling with unpaid holders pays", action: chain.CorporateAction{Status: 4, HoldersPaid: 1, HoldersSnapshotted: 3},
			wantStep: StepPay},
		{name: "settling with all paid completes", action: chain.CorporateAction{Status: 4, HoldersPaid: 3, HoldersSnapshotted: 3},
			wantStep: StepComplete},
		{name: "completed sweeps the escrow back to the issuer", action: chain.CorporateAction{Status: 5},
			wantStep: StepSweep},
		{name: "retiring with holders retires", action: chain.CorporateAction{Status: 6, HoldersRetired: 0, HoldersSnapshotted: 3},
			wantStep: StepRetire},
		{name: "retiring fully burnt closes", action: chain.CorporateAction{Status: 6, HoldersRetired: 3, HoldersSnapshotted: 3},
			wantStep: StepClose},
		{name: "cancelled sweeps the escrow back to the issuer", action: chain.CorporateAction{Status: 7},
			wantStep: StepSweep},
		{name: "voting open before deadline waits", action: chain.CorporateAction{Status: 8, VotingEndsAt: later.Unix(), UnitsSnapshotted: 100},
			now: now, wantWaitIn: "voting"},
		{name: "voting open at deadline finalizes", action: chain.CorporateAction{Status: 8, VotingEndsAt: now.Unix(), UnitsSnapshotted: 100},
			now: later, wantStep: StepMeetFinal},
		{name: "voting open on full turnout finalizes", action: chain.CorporateAction{Status: 8, VotingEndsAt: later.Unix(), UnitsSnapshotted: 100, VotesFor: 60, VotesAgainst: 40},
			now: now, wantStep: StepMeetFinal},
		{name: "finalized approved applies", action: chain.CorporateAction{Status: 9, Result: 1},
			wantStep: StepApplyTerms},
		{name: "finalized rejected has nothing to do", action: chain.CorporateAction{Status: 9, Result: 2},
			wantWaitIn: "not approved"},
		// Plan 15 (task 1522): hooked record date, default and cure, bank-routed payouts — real and demo clocks.
		{name: "hooked announced waits for the record date", action: chain.CorporateAction{Status: 0, RecordAt: later.Unix()},
			series: chain.Series{Hook: 1}, supply: 100, now: now, wantWaitIn: "record date"},
		{name: "hooked announced snapshots after the record date (no strike)", action: chain.CorporateAction{Status: 0, RecordAt: now.Unix()},
			series: chain.Series{Hook: 1, OpenTrades: 2, CkptCount: 3}, supply: 100, now: now, wantStep: StepSnapshot},
		{name: "hooked: every unit but not every position snapshotted", action: chain.CorporateAction{Status: 1, UnitsSnapshotted: 100, PositionsDone: 2},
			series: chain.Series{Hook: 1, CkptCount: 3}, supply: 100, wantStep: StepSnapshot},
		{name: "hooked: late positions count as done", action: chain.CorporateAction{Status: 1, UnitsSnapshotted: 100, PositionsDone: 2},
			series: chain.Series{Hook: 1, CkptCount: 3, CkptLate: 1}, supply: 100, wantStep: StepFinalize},
		{name: "unfunded before the default deadline waits (real clock: payment + 1 day)",
			action: chain.CorporateAction{Status: 2, RecordAt: now.Unix() - 120, PaymentAt: now.Unix() - 60},
			now:    now, wantWaitIn: "default is due"},
		{name: "unfunded past payment + 1 day: anyone declares the default",
			action: chain.CorporateAction{Status: 2, RecordAt: now.Unix() - 90_000, PaymentAt: now.Unix() - 86_400},
			now:    now, wantStep: StepDefault},
		{name: "demo clock: the grace is one series day",
			action: chain.CorporateAction{Status: 2, RecordAt: now.Unix() - 10, PaymentAt: now.Unix() - 2},
			series: chain.Series{DaySecs: 2}, now: now, wantStep: StepDefault},
		{name: "a late finalize moves the deadline", action: chain.CorporateAction{Status: 2, RecordAt: now.Unix() - 100,
			PaymentAt: now.Unix() - 50, FinalizeDelay: 99}, series: chain.Series{DaySecs: 2}, now: now, wantWaitIn: "default is due"},
		{name: "autofund funds instead of defaulting", action: chain.CorporateAction{Status: 2, PaymentAt: now.Unix() - 90_000},
			autofund: true, now: now, wantStep: StepFund},
		{name: "defaulted waits for the cure", action: chain.CorporateAction{Status: 10},
			wantWaitIn: "cures"},
		{name: "defaulted with autofund cures", action: chain.CorporateAction{Status: 10},
			autofund: true, wantStep: StepFund},
		{name: "settling: bank payouts await the agent, never automatic", action: chain.CorporateAction{Status: 4, HoldersPaid: 3,
			HoldersSnapshotted: 3, BankPending: 1}, wantWaitIn: "paying agent"},
		{name: "unknown status", action: chain.CorporateAction{Status: 42},
			wantWaitIn: "unknown"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			step, wait := NextStep(&tt.action, &tt.series, tt.supply, tt.now, tt.autofund)
			if tt.wantWaitIn != "" {
				if step != "" || !strings.Contains(wait, tt.wantWaitIn) {
					t.Fatalf("NextStep = (%q, %q), want wait containing %q", step, wait, tt.wantWaitIn)
				}
				return
			}
			if step != tt.wantStep || wait != "" {
				t.Fatalf("NextStep = (%q, %q), want step %q", step, wait, tt.wantStep)
			}
			if _, err := Args(step, "QPNb1", 1); err != nil {
				t.Fatalf("step %q has no CLI command: %v", step, err)
			}
		})
	}
}

// Batch commands print per-batch signatures; the step reports the last one (shown with an explorer link in the UI).
func TestRunBatchReportsLastSignature(t *testing.T) {
	dir := t.TempDir()
	stdout := writeFile(t, dir, "out.json", `{"ok":true,"batches":2,"results":[{"signature":"first","slot":"10","holders":8},{"signature":"last","slot":"11","holders":2}]}`)
	t.Setenv("FAKE_CLI_STDOUT", stdout)
	res, err := New(fakeCLI(t), "testdata/devnet.json", nil).Run(t.Context(), "action:pay", "--series", "QPNb1")
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if res.Signature != "last" || uint64(res.Slot) != 11 {
		t.Fatalf("res = %+v, want the last batch (last, 11)", res)
	}
}

func TestRedactKeys(t *testing.T) {
	in := `failed: POST https://devnet.helius-rpc.com/?api-key=abc-123&x=1: 429 {"url":"https://h/?API_KEY=zz"}`
	out := redactKeys(in)
	if strings.Contains(out, "abc-123") || strings.Contains(out, "zz") {
		t.Fatalf("key survived: %s", out)
	}
	if !strings.Contains(out, "api-key=…&x=1") {
		t.Fatalf("unexpected redaction: %s", out)
	}
}

func TestStatsReportsRunningAndQueued(t *testing.T) {
	e := New(fakeCLI(t), "testdata/devnet.json", nil)
	if r, q := e.Stats(); r != 0 || q != 0 {
		t.Fatalf("idle stats = (%d, %d), want (0, 0)", r, q)
	}
	// occupy one slot and park one waiter, as two concurrent Runs would
	e.slots <- struct{}{}
	e.waiting.Add(1)
	if r, q := e.Stats(); r != 1 || q != 1 {
		t.Fatalf("busy stats = (%d, %d), want (1, 1)", r, q)
	}
	<-e.slots
	e.waiting.Add(-1)
}

func TestLogArgsMasksBankDetails(t *testing.T) {
	got := strings.Join(logArgs([]string{"payout:confirm-bank", "--owner", "X", "--reference", "SWIFT-1"}), " ")
	if got != "payout:confirm-bank --owner X --reference …" {
		t.Fatalf("logArgs = %q", got)
	}
}

// One CLI already running (the autopilot) must leave room for a second caller (sandbox create): Run used to take a
// slot and exec a second one, so two concurrent Runs held both slots and waited forever (prod sandbox hang, 2026-10-12).
func TestRunWithOneSlotBusyDoesNotDeadlock(t *testing.T) {
	t.Setenv("FAKE_CLI_STDOUT", writeFile(t, t.TempDir(), "out.json", `{"ok":true,"signature":"sig","slot":"1"}`+"\n"))
	e := New(fakeCLI(t), "testdata/devnet.json", nil)
	e.slots <- struct{}{} // another CLI holds one of the MaxConcurrent slots
	defer func() { <-e.slots }()
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	if _, err := e.Run(ctx, "action:strike", "--series", "QPNb1", "--index", "1"); err != nil {
		t.Fatalf("run with one slot busy: %v", err)
	}
}
