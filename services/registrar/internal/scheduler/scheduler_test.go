package scheduler

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// Fixed clock: the acceptance criterion is "tests cover the decision function
// with a fake clock". All timestamps are relative to now0.
var now0 = time.Unix(1_800_000_000, 0) // 2027-01-15T08:00:00Z

var (
	kMint   = solana.PublicKey{1: 1}
	kSeries = solana.PublicKey{2: 2}
	kAction = solana.PublicKey{4: 4}
	kCash   = solana.PublicKey{3: 3}
	cfg     = Config{Tick: time.Second, Lead: 2 * time.Minute, PaymentDelay: time.Minute, MinRecordDelay: 30 * time.Second, AutoFund: true}
)

func series(nextCoupon, maturity int64) *chain.Series {
	return &chain.Series{
		Mint: kMint, CashMint: kCash, Status: 0,
		NextCouponDate: nextCoupon, MaturityDate: maturity, ActionCount: 3,
	}
}

func action(status uint8) *chain.CorporateAction {
	return &chain.CorporateAction{
		Series: kSeries, Index: 3, Status: status,
		RecordAt: now0.Add(50 * time.Second).Unix(), PaymentAt: now0.Add(70 * time.Second).Unix(),
		HoldersSnapshotted: 2, UnitsSnapshotted: 2, HoldersPaid: 1, HoldersRetired: 1,
	}
}

func TestDecide(t *testing.T) {
	maturity := now0.Add(24 * time.Hour).Unix()
	tests := []struct {
		name   string
		series *chain.Series
		open   *chain.CorporateAction
		supply uint64
		now    time.Time
		cfg    Config
		want   Decision
	}{
		{
			name:   "no open action, coupon far away → wait",
			series: series(now0.Add(3*time.Minute).Unix(), maturity),
			now:    now0,
			want:   Decision{Kind: KindWait, Reason: "next coupon 2027-01-15T13:03:00+05:00; announce at -2m0s"},
		},
		{
			name:   "inside the lead window → announce INTR at the coupon date",
			series: series(now0.Add(90*time.Second).Unix(), maturity),
			now:    now0,
			want: Decision{Kind: KindAnnounce, Action: "INTR",
				RecordAt: now0.Add(90 * time.Second).Unix(), PaymentAt: now0.Add(150 * time.Second).Unix()},
		},
		{
			name:   "late tick: record date floored to now+MinRecordDelay",
			series: series(now0.Add(-time.Minute).Unix(), maturity),
			now:    now0,
			want: Decision{Kind: KindAnnounce, Action: "INTR",
				RecordAt: now0.Add(30 * time.Second).Unix(), PaymentAt: now0.Add(90 * time.Second).Unix()},
		},
		{
			name:   "final coupon at maturity → announce REDM",
			series: series(now0.Add(90*time.Second).Unix(), now0.Add(90*time.Second).Unix()),
			now:    now0,
			want: Decision{Kind: KindAnnounce, Action: "REDM",
				RecordAt: now0.Add(90 * time.Second).Unix(), PaymentAt: now0.Add(150 * time.Second).Unix()},
		},
		{
			name:   "closed series → wait",
			series: func() *chain.Series { s := series(now0.Unix(), maturity); s.Status = 3; return s }(),
			now:    now0,
			want:   Decision{Kind: KindWait, Reason: "series status 3: nothing to schedule"},
		},
		{
			name:   "announced before the record date → wait",
			series: series(now0.Unix(), maturity),
			open:   action(0),
			supply: 2,
			now:    now0,
			want:   Decision{Kind: KindWait, Reason: "record date not reached until 2027-01-15T13:00:50+05:00"},
		},
		{
			name:   "announced at the record date → strike",
			series: series(now0.Unix(), maturity),
			open:   action(0),
			supply: 2,
			now:    now0.Add(time.Minute),
			want:   Decision{Kind: KindStep, Action: executor.StepStrike},
		},
		{
			// the autopilot never settles or cancels a trade: it waits for the operator (docs/03-domain.md §4a)
			name:   "announced at the record date with open trades → wait, no step",
			series: func() *chain.Series { s := series(now0.Unix(), maturity); s.OpenTrades = 1; return s }(),
			open:   action(0),
			supply: 2,
			now:    now0.Add(time.Minute),
			want:   Decision{Kind: KindWait, Reason: "open secondary trades: settle or cancel them first (1)"},
		},
		{
			name:   "record struck, holders missing → snapshot",
			series: series(now0.Unix(), maturity),
			open:   action(1),
			supply: 3,
			now:    now0,
			want:   Decision{Kind: KindStep, Action: executor.StepSnapshot},
		},
		{
			name:   "record struck, all holders snapshotted → finalize",
			series: series(now0.Unix(), maturity),
			open:   action(1),
			supply: 2,
			now:    now0,
			want:   Decision{Kind: KindStep, Action: executor.StepFinalize},
		},
		{
			name:   "snapshot complete, autofund off → wait for issuer",
			series: series(now0.Unix(), maturity),
			open:   action(2),
			supply: 2,
			now:    now0,
			cfg:    Config{Lead: cfg.Lead},
			want:   Decision{Kind: KindWait, Reason: "waiting for issuer funding (re-run with autofund:true)"},
		},
		{
			name:   "snapshot complete, autofund on → fund",
			series: series(now0.Unix(), maturity),
			open:   action(2),
			supply: 2,
			now:    now0,
			want:   Decision{Kind: KindStep, Action: executor.StepFund},
		},
		{
			name:   "funded before the payment date → wait",
			series: series(now0.Unix(), maturity),
			open:   action(3),
			supply: 2,
			now:    now0,
			want:   Decision{Kind: KindWait, Reason: "payment date not reached until 2027-01-15T13:01:10+05:00"},
		},
		{
			name:   "funded at the payment date → pay",
			series: series(now0.Unix(), maturity),
			open:   action(3),
			supply: 2,
			now:    now0.Add(2 * time.Minute),
			want:   Decision{Kind: KindStep, Action: executor.StepPay},
		},
		{
			name:   "settling with a holder unpaid → pay",
			series: series(now0.Unix(), maturity),
			open:   action(4),
			supply: 2,
			now:    now0,
			want:   Decision{Kind: KindStep, Action: executor.StepPay},
		},
		{
			name:   "settling, all paid → complete",
			series: series(now0.Unix(), maturity), open: func() *chain.CorporateAction {
				a := action(4)
				a.HoldersPaid = 2
				return a
			}(), supply: 2, now: now0,
			want: Decision{Kind: KindStep, Action: executor.StepComplete},
		},
		{
			name:   "retiring with holders left → retire",
			series: series(now0.Unix(), maturity),
			open:   action(6),
			supply: 2,
			now:    now0,
			want:   Decision{Kind: KindStep, Action: executor.StepRetire},
		},
		{
			name:   "retiring, all retired → close",
			series: series(now0.Unix(), maturity), open: func() *chain.CorporateAction {
				a := action(6)
				a.HoldersRetired = 2
				return a
			}(), supply: 2, now: now0,
			want: Decision{Kind: KindStep, Action: executor.StepClose},
		},
		{
			name:   "completed action → wait",
			series: series(now0.Unix(), maturity),
			open:   action(5),
			supply: 2,
			now:    now0,
			want:   Decision{Kind: KindStep, Action: executor.StepSweep},
		},
		{
			name:   "cancelled action → sweep the escrow",
			series: series(now0.Unix(), maturity),
			open:   action(7),
			supply: 2,
			now:    now0,
			want:   Decision{Kind: KindStep, Action: executor.StepSweep},
		},
		{
			name:   "meeting actions are issuer-driven → wait",
			series: series(now0.Unix(), maturity),
			open: func() *chain.CorporateAction {
				a := action(8)
				a.VotingEndsAt = now0.Add(10 * time.Minute).Unix()
				a.UnitsSnapshotted = 100 // votes outstanding, not full turnout
				return a
			}(),
			supply: 2,
			now:    now0,
			want:   Decision{Kind: KindWait, Reason: "voting still open"},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			c := tc.cfg
			if c == (Config{}) {
				c = cfg
			}
			got := Decide(tc.series, tc.open, tc.supply, tc.now, c)
			if got != tc.want {
				t.Fatalf("Decide = %+v, want %+v", got, tc.want)
			}
		})
	}
}

// fakeChain plays devnet for Tick: one series with a mutable open action.
type fakeChain struct {
	series   *chain.Series
	action   *chain.CorporateAction
	investor int
}

func (f *fakeChain) AllSeries(context.Context) ([]chain.SeriesRecord, error) {
	return []chain.SeriesRecord{{PDA: kSeries, Series: f.series}}, nil
}

func (f *fakeChain) FetchCorporateAction(_ context.Context, pda solana.PublicKey) (*chain.CorporateAction, error) {
	if pda == kAction {
		return f.action, nil
	}
	return nil, nil
}

func (f *fakeChain) FetchMint(context.Context, solana.PublicKey) (*chain.Mint, error) {
	return &chain.Mint{Supply: 100}, nil
}

func (f *fakeChain) FetchInvestorsBySeries(context.Context, solana.PublicKey) ([]chain.InvestorRecord, error) {
	out := make([]chain.InvestorRecord, f.investor)
	for i := range out {
		out[i] = chain.InvestorRecord{Investor: &chain.Investor{Series: kSeries, Owner: solana.PublicKey{byte(i) + 1}}}
	}
	return out, nil
}

func newScheduler(t *testing.T, fc *fakeChain, cfg Config) (*Scheduler, *store.Store, string) {
	t.Helper()
	dir := t.TempDir()
	data, err := os.ReadFile("../executor/testdata/fake-cli.sh")
	if err != nil {
		t.Fatalf("read fake cli: %v", err)
	}
	bin := filepath.Join(dir, "fake-cli.sh")
	if err := os.WriteFile(bin, data, 0o755); err != nil {
		t.Fatalf("write fake cli: %v", err)
	}
	cfgPath := filepath.Join(dir, "devnet.json")
	if err := os.WriteFile(cfgPath, []byte(fmt.Sprintf(`{"series":{"QPNb1":{"mint":"%s"}}}`, kMint)), 0o644); err != nil {
		t.Fatalf("write cfg: %v", err)
	}
	st, err := store.Open(t.Context(), filepath.Join(dir, "sched.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	log := filepath.Join(dir, "cli.log")
	t.Setenv("FAKE_CLI_LOG", log)
	t.Setenv("FAKE_CLI_STDOUT", writeJSON(t, dir, `{"ok":true,"signature":"sig-sched","slot":"7"}`))
	s := &Scheduler{
		Cfg: cfg, Read: fc, Exec: executor.New(bin, cfgPath, nil), Store: st,
		Log: slog.New(slog.DiscardHandler), Now: func() time.Time { return now0 },
	}
	return s, st, log
}

func writeJSON(t *testing.T, dir, s string) string {
	t.Helper()
	p := filepath.Join(dir, "out.json")
	if err := os.WriteFile(p, []byte(s), 0o644); err != nil {
		t.Fatalf("write out.json: %v", err)
	}
	return p
}

// TestTickAnnounceExecutes: inside the lead window the scheduler runs the
// announce argv through the CLI (fake clock fixes the record/payment stamps).
func TestTickAnnounceExecutes(t *testing.T) {
	fc := &fakeChain{series: series(now0.Add(90*time.Second).Unix(), now0.Add(24*time.Hour).Unix())}
	s, st, log := newScheduler(t, fc, cfg)
	s.Tick(t.Context())

	raw, _ := os.ReadFile(log)
	want := fmt.Sprintf("--json action:announce --series QPNb1 --kind INTR --record-at %d --payment-at %d",
		now0.Add(90*time.Second).Unix(), now0.Add(150*time.Second).Unix())
	if strings.TrimSpace(string(raw)) != want {
		t.Fatalf("cli log = %q, want %q", raw, want)
	}
	events, err := st.ListActivity(t.Context(), 10)
	if err != nil || len(events) != 1 {
		t.Fatalf("activity rows = %v (%v), want 1 scheduler:INTR row", len(events), err)
	}
	if events[0].Kind != "scheduler:INTR" {
		t.Fatalf("activity kind = %s, want scheduler:INTR", events[0].Kind)
	}
}

// TestTickPayFailureRecordsPartialBatches (task 1408): a pay step whose 2nd
// batch fails exits 1 with the completed batches in stdout JSON — the scheduler
// records those signatures in the activity feed, or the money-moving
// transactions vanish when the step is retried.
func TestTickPayFailureRecordsPartialBatches(t *testing.T) {
	fc := &fakeChain{series: func() *chain.Series {
		s := series(now0.Unix(), now0.Add(24*time.Hour).Unix())
		s.OpenAction = &kAction
		return s
	}(), action: action(4)} // Settling, one holder unpaid → pay_batch
	s, st, _ := newScheduler(t, fc, cfg)
	t.Setenv("FAKE_CLI_STDOUT", writeJSON(t, t.TempDir(),
		`{"ok":false,"error":"batch 2/2 failed","results":[{"signature":"pay1","slot":"10","holders":8}]}`))
	t.Setenv("FAKE_CLI_EXIT", "1")

	s.Tick(t.Context())

	events, err := st.ListActivity(t.Context(), 10)
	if err != nil || len(events) != 1 {
		t.Fatalf("activity rows = %d (%v), want the completed batch", len(events), err)
	}
	if events[0].Kind != "scheduler:"+executor.StepPay || events[0].Sig != "pay1" || events[0].Slot != 10 {
		t.Fatalf("row = %+v, want scheduler:pay_batch pay1@10", events[0])
	}
	if !strings.Contains(string(events[0].Payload), "batch 2/2 failed") {
		t.Fatalf("payload = %s, want the CLI error recorded", events[0].Payload)
	}
}

// settlingChain is one series whose open action is Settling with every holder
// paid: one Tick runs complete_action, then the escrow sweep follow-up (task 1414).
func settlingChain() *fakeChain {
	return &fakeChain{
		series: func() *chain.Series {
			s := series(now0.Unix(), now0.Add(24*time.Hour).Unix())
			s.OpenAction = &kAction
			return s
		}(),
		action: func() *chain.CorporateAction {
			a := action(4)
			a.HoldersPaid = 2
			return a
		}(),
	}
}

// TestTickCompleteSweepsEscrow (task 1414): a successful complete step is
// followed by `qupon action:sweep` for the same action — complete clears
// series.open_action, so no later tick would ever find it.
func TestTickCompleteSweepsEscrow(t *testing.T) {
	s, st, log := newScheduler(t, settlingChain(), cfg)
	s.Tick(t.Context())

	raw, _ := os.ReadFile(log)
	want := "--json action:complete --series QPNb1 --index 3\n--json action:sweep --series QPNb1 --index 3"
	if strings.TrimSpace(string(raw)) != want {
		t.Fatalf("cli log = %q, want complete then sweep", raw)
	}
	events, err := st.ListActivity(t.Context(), 10)
	if err != nil || len(events) != 2 {
		t.Fatalf("activity rows = %d (%v), want complete + sweep", len(events), err)
	}
	if events[1].Kind != "scheduler:"+executor.StepSweep {
		t.Fatalf("sweep kind = %s, want scheduler:%s", events[1].Kind, executor.StepSweep)
	}
	// the sweep row carries the action PDA so the web timeline can match it
	if events[1].ActionPDA == nil || *events[1].ActionPDA != kAction.String() {
		t.Fatalf("sweep row action = %v, want %s", events[1].ActionPDA, kAction)
	}
}

// TestTickSweepFailureDoesNotFailCompletion (task 1414): a refused sweep is
// logged and swallowed — the completion still lands as ok in the activity feed.
func TestTickSweepFailureDoesNotFailCompletion(t *testing.T) {
	s, st, log := newScheduler(t, settlingChain(), cfg)
	// a CLI that succeeds for every step but the sweep
	dir := t.TempDir()
	bin := filepath.Join(dir, "sweep-fails.sh")
	script := "#!/bin/sh\n" +
		"[ -n \"$FAKE_CLI_LOG\" ] && printf '%s\\n' \"$*\" >>\"$FAKE_CLI_LOG\"\n" +
		"if [ \"$2\" = action:sweep ]; then echo '{\"ok\":false,\"error\":\"boom\"}'; exit 1; fi\n" +
		"[ -f \"$FAKE_CLI_STDOUT\" ] && cat \"$FAKE_CLI_STDOUT\"\n"
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatalf("write cli: %v", err)
	}
	s.Exec = executor.New(bin, s.Exec.ConfigPath(), nil)

	s.Tick(t.Context())

	raw, _ := os.ReadFile(log)
	if !strings.Contains(string(raw), "action:sweep") {
		t.Fatal("the sweep ran even though it fails")
	}
	events, err := st.ListActivity(t.Context(), 10)
	if err != nil || len(events) != 1 {
		t.Fatalf("activity rows = %d (%v), want only the completed step", len(events), err)
	}
	if events[0].Kind != "scheduler:"+executor.StepComplete || !strings.Contains(string(events[0].Payload), `"ok":true`) {
		t.Fatalf("completion row = %+v, want ok scheduler:complete_action", events[0])
	}
}

// TestTickApprovalGate: with ApprovalRequired nothing is executed; the pending
// approval holds the exact argv and is deduped across ticks.
func TestTickApprovalGate(t *testing.T) {
	fc := &fakeChain{series: series(now0.Add(90*time.Second).Unix(), now0.Add(24*time.Hour).Unix())}
	c := cfg
	c.ApprovalRequired = true
	s, st, log := newScheduler(t, fc, c)
	s.Tick(t.Context())
	s.Tick(t.Context()) // dedup: still one row, still no execution

	if _, err := os.Stat(log); !os.IsNotExist(err) {
		t.Fatalf("cli was executed under approval gate (log: %v)", err)
	}
	rows, err := st.ListApprovals(t.Context(), "pending")
	if err != nil || len(rows) != 1 {
		t.Fatalf("pending approvals = %d (%v), want 1 (deduped)", len(rows), err)
	}
	if rows[0].Step != "announce:INTR" || rows[0].ActionPDA != "" {
		t.Fatalf("approval = %+v, want step announce:INTR with no action pda", rows[0])
	}
	wantArgs := []string{"action:announce", "--series", "QPNb1", "--kind", "INTR",
		"--record-at", fmt.Sprint(now0.Add(90 * time.Second).Unix()),
		"--payment-at", fmt.Sprint(now0.Add(150 * time.Second).Unix())}
	if strings.Join(rows[0].Args, " ") != strings.Join(wantArgs, " ") {
		t.Fatalf("approval args = %v, want %v", rows[0].Args, wantArgs)
	}
}

// TestTickStaleExpiredAnnounce: an announce approval nobody approved before
// its record date is staled on the next tick and a fresh proposal with new
// dates takes its place — the pending-dedup index would otherwise block
// re-proposal forever (task 1405).
func TestTickStaleExpiredAnnounce(t *testing.T) {
	fc := &fakeChain{series: series(now0.Add(90*time.Second).Unix(), now0.Add(24*time.Hour).Unix())}
	c := cfg
	c.ApprovalRequired = true
	s, st, _ := newScheduler(t, fc, c)
	clock := now0
	s.Now = func() time.Time { return clock }

	s.Tick(t.Context()) // propose announce:INTR with record-at now0+90s
	before, err := st.ListApprovals(t.Context(), "pending")
	if err != nil || len(before) != 1 {
		t.Fatalf("pending after first tick = %d (%v), want 1", len(before), err)
	}

	// Nobody approves; the record date passes; the next tick re-proposes.
	clock = now0.Add(2 * time.Minute)
	s.Tick(t.Context())

	all, err := st.ListApprovals(t.Context(), "")
	if err != nil {
		t.Fatalf("list approvals: %v", err)
	}
	var stale, fresh []store.Approval
	for _, a := range all {
		switch a.Status {
		case "stale":
			stale = append(stale, a)
		case "pending":
			fresh = append(fresh, a)
		}
	}
	if len(stale) != 1 || stale[0].ID != before[0].ID {
		t.Fatalf("stale = %+v, want the original announce row %d", stale, before[0].ID)
	}
	if len(fresh) != 1 {
		t.Fatalf("pending = %+v, want one fresh proposal", fresh)
	}
	// The fresh announce is floored to now+MinRecordDelay (30 s).
	ra, ok := executor.FlagValue(fresh[0].Args, "--record-at")
	want := strconv.FormatInt(now0.Add(2*time.Minute+30*time.Second).Unix(), 10)
	if !ok || ra != want {
		t.Fatalf("fresh record-at = %q (%v), want %q", ra, ok, want)
	}
}

// TestTickStaleSupersededStep: a pending proposal for a step the chain has
// already moved past (dedup key differs from the current decision) is sta'd
// when the scheduler proposes the next step.
func TestTickStaleSupersededStep(t *testing.T) {
	fc := &fakeChain{series: func() *chain.Series {
		s := series(now0.Unix(), now0.Add(24*time.Hour).Unix())
		s.OpenAction = &kAction
		return s
	}(), action: action(3)} // Funded, payment date passed → pay_batch
	c := cfg
	c.ApprovalRequired = true
	s, st, _ := newScheduler(t, fc, c)
	clock := now0.Add(2 * time.Minute)
	s.Now = func() time.Time { return clock }

	// An orphaned proposal from before the chain moved on.
	if err := st.InsertApproval(t.Context(), store.Approval{
		Ts: now0.Unix(), DedupKey: fmt.Sprintf("%s|3|step:fund_action", kMint),
		SeriesMint: kMint.String(), ActionPDA: kAction.String(), Step: "step:fund_action",
		Args: []string{"action:fund", "--series", "QPNb1", "--index", "3"},
	}); err != nil {
		t.Fatalf("insert: %v", err)
	}

	s.Tick(t.Context())

	orphan, err := st.ApprovalByID(t.Context(), 1)
	if err != nil || orphan.Status != "stale" {
		t.Fatalf("orphan = %s (%v), want stale", orphan.Status, err)
	}
	fresh, err := st.ListApprovals(t.Context(), "pending")
	if err != nil || len(fresh) != 1 || fresh[0].Step != "step:pay_batch" {
		t.Fatalf("pending = %+v (%v), want one step:pay_batch", fresh, err)
	}
}

// TestTickDryRun: logs only — no CLI run, no approval row, no activity.
func TestTickDryRun(t *testing.T) {
	fc := &fakeChain{series: series(now0.Add(90*time.Second).Unix(), now0.Add(24*time.Hour).Unix())}
	c := cfg
	c.DryRun = true
	s, st, log := newScheduler(t, fc, c)
	s.Tick(t.Context())

	if _, err := os.Stat(log); !os.IsNotExist(err) {
		t.Fatal("dry-run executed the CLI")
	}
	rows, _ := st.ListApprovals(t.Context(), "")
	if len(rows) != 0 {
		t.Fatal("dry-run created an approval")
	}
	events, _ := st.ListActivity(t.Context(), 10)
	if len(events) != 0 {
		t.Fatal("dry-run recorded activity")
	}
}

// main.go builds the Scheduler without Now; Run must default the clock instead of panicking on the first tick.
func TestRunWithoutClockDoesNotPanic(t *testing.T) {
	fc := &fakeChain{series: series(now0.Add(90*time.Second).Unix(), now0.Add(24*time.Hour).Unix())}
	s, _, _ := newScheduler(t, fc, Config{Tick: time.Second, DryRun: true})
	s.Now = nil
	ctx, cancel := context.WithTimeout(t.Context(), 1500*time.Millisecond)
	defer cancel()
	s.Run(ctx) // one tick at 1 s; a nil clock would panic here
}

func TestLastTick(t *testing.T) {
	fc := &fakeChain{series: series(now0.Add(90*time.Second).Unix(), now0.Add(24*time.Hour).Unix())}
	s, _, _ := newScheduler(t, fc, DemoConfig())
	if !s.LastTick().IsZero() {
		t.Fatal("lastTick before the first pass should be zero")
	}
	s.Tick(t.Context()) // the fake clock makes the tick deterministic
	if !s.LastTick().Equal(now0) {
		t.Fatalf("lastTick = %v, want %v", s.LastTick(), now0)
	}
}
