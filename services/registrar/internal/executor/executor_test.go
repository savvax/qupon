package executor

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

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
		investors  int
		now        time.Time
		autofund   bool
		wantStep   string
		wantWaitIn string // "" → wantStep; otherwise wait reason contains this
	}{
		{name: "announced strikes", action: chain.CorporateAction{Status: 0},
			wantStep: StepStrike},
		{name: "record struck snapshots holders", action: chain.CorporateAction{Status: 1, HoldersSnapshotted: 1},
			investors: 3, wantStep: StepSnapshot},
		{name: "record struck with all holders finalizes", action: chain.CorporateAction{Status: 1, HoldersSnapshotted: 3},
			investors: 3, wantStep: StepFinalize},
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
		{name: "completed is done", action: chain.CorporateAction{Status: 5},
			wantWaitIn: "completed"},
		{name: "retiring with holders retires", action: chain.CorporateAction{Status: 6, HoldersRetired: 0, HoldersSnapshotted: 3},
			wantStep: StepRetire},
		{name: "retiring fully burnt closes", action: chain.CorporateAction{Status: 6, HoldersRetired: 3, HoldersSnapshotted: 3},
			wantStep: StepClose},
		{name: "cancelled is done", action: chain.CorporateAction{Status: 7},
			wantWaitIn: "cancelled"},
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
		{name: "unknown status", action: chain.CorporateAction{Status: 42},
			wantWaitIn: "unknown"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			step, wait := NextStep(&tt.action, tt.investors, tt.now, tt.autofund)
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
