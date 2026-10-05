package scheduler

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
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
		HoldersSnapshotted: 2, HoldersPaid: 1, HoldersRetired: 1,
	}
}

func TestDecide(t *testing.T) {
	maturity := now0.Add(24 * time.Hour).Unix()
	tests := []struct {
		name      string
		series    *chain.Series
		open      *chain.CorporateAction
		investors int
		now       time.Time
		cfg       Config
		want      Decision
	}{
		{
			name:   "no open action, coupon far away → wait",
			series: series(now0.Add(3*time.Minute).Unix(), maturity),
			now:    now0,
			want:   Decision{Kind: KindWait, Reason: "next coupon 2027-01-15T08:03:00Z; announce at -2m0s"},
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
			name:      "announced before the record date → wait",
			series:    series(now0.Unix(), maturity),
			open:      action(0),
			investors: 2,
			now:       now0,
			want:      Decision{Kind: KindWait, Reason: "record date not reached until 2027-01-15T08:00:50Z"},
		},
		{
			name:      "announced at the record date → strike",
			series:    series(now0.Unix(), maturity),
			open:      action(0),
			investors: 2,
			now:       now0.Add(time.Minute),
			want:      Decision{Kind: KindStep, Action: executor.StepStrike},
		},
		{
			name:      "record struck, holders missing → snapshot",
			series:    series(now0.Unix(), maturity),
			open:      action(1),
			investors: 3,
			now:       now0,
			want:      Decision{Kind: KindStep, Action: executor.StepSnapshot},
		},
		{
			name:      "record struck, all holders snapshotted → finalize",
			series:    series(now0.Unix(), maturity),
			open:      action(1),
			investors: 2,
			now:       now0,
			want:      Decision{Kind: KindStep, Action: executor.StepFinalize},
		},
		{
			name:      "snapshot complete, autofund off → wait for issuer",
			series:    series(now0.Unix(), maturity),
			open:      action(2),
			investors: 2,
			now:       now0,
			cfg:       Config{Lead: cfg.Lead},
			want:      Decision{Kind: KindWait, Reason: "waiting for issuer funding (re-run with autofund:true)"},
		},
		{
			name:      "snapshot complete, autofund on → fund",
			series:    series(now0.Unix(), maturity),
			open:      action(2),
			investors: 2,
			now:       now0,
			want:      Decision{Kind: KindStep, Action: executor.StepFund},
		},
		{
			name:      "funded before the payment date → wait",
			series:    series(now0.Unix(), maturity),
			open:      action(3),
			investors: 2,
			now:       now0,
			want:      Decision{Kind: KindWait, Reason: "payment date not reached until 2027-01-15T08:01:10Z"},
		},
		{
			name:      "funded at the payment date → pay",
			series:    series(now0.Unix(), maturity),
			open:      action(3),
			investors: 2,
			now:       now0.Add(2 * time.Minute),
			want:      Decision{Kind: KindStep, Action: executor.StepPay},
		},
		{
			name:      "settling with a holder unpaid → pay",
			series:    series(now0.Unix(), maturity),
			open:      action(4),
			investors: 2,
			now:       now0,
			want:      Decision{Kind: KindStep, Action: executor.StepPay},
		},
		{
			name:   "settling, all paid → complete",
			series: series(now0.Unix(), maturity), open: func() *chain.CorporateAction {
				a := action(4)
				a.HoldersPaid = 2
				return a
			}(), investors: 2, now: now0,
			want: Decision{Kind: KindStep, Action: executor.StepComplete},
		},
		{
			name:      "retiring with holders left → retire",
			series:    series(now0.Unix(), maturity),
			open:      action(6),
			investors: 2,
			now:       now0,
			want:      Decision{Kind: KindStep, Action: executor.StepRetire},
		},
		{
			name:   "retiring, all retired → close",
			series: series(now0.Unix(), maturity), open: func() *chain.CorporateAction {
				a := action(6)
				a.HoldersRetired = 2
				return a
			}(), investors: 2, now: now0,
			want: Decision{Kind: KindStep, Action: executor.StepClose},
		},
		{
			name:      "completed action → wait",
			series:    series(now0.Unix(), maturity),
			open:      action(5),
			investors: 2,
			now:       now0,
			want:      Decision{Kind: KindWait, Reason: "action completed"},
		},
		{
			name:   "meeting actions are issuer-driven → wait",
			series: series(now0.Unix(), maturity),
			open: func() *chain.CorporateAction {
				a := action(8)
				a.VotingEndsAt = now0.Add(10 * time.Minute).Unix()
				return a
			}(),
			investors: 2,
			now:       now0,
			want:      Decision{Kind: KindWait, Reason: "voting still open"},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			c := tc.cfg
			if c == (Config{}) {
				c = cfg
			}
			got := Decide(tc.series, tc.open, tc.investors, tc.now, c)
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
