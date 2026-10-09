// Package scheduler is the autopilot loop (task 024, docs/02-architecture.md
// §Data flow): per series it announces INTR/REDM ahead of the coupon date,
// strikes at the record date, funds (autofund) and pays at the payment date.
// The service holds no business logic of its own: Decide only adds *when*
// gates around executor.NextStep, and every precondition stays on-chain (a
// refused CLI step is retried on the next tick, never fatal). With
// ApprovalRequired the scheduler records a pending approval instead of
// executing; a human then POSTs /approvals/{id}/approve.
package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// Config is the scheduler tuning (flags on the registrar, docs/01-product §S1).
type Config struct {
	Tick             time.Duration // decision loop period (default 30 s)
	Lead             time.Duration // announce this long before next_coupon_date (docs: 5 d, demo: 2 min)
	PaymentDelay     time.Duration // record_at → payment_at for announced actions (docs: 2 d, demo: 60 s)
	MinRecordDelay   time.Duration // floor on now→record_at so announce is never in the past
	AutoFund         bool          // fund the escrow from the paying agent without the issuer
	ApprovalRequired bool          // propose only: create pending approvals, never execute
	DryRun           bool          // log what would run, touch nothing
}

// DefaultConfig is the production cadence (30 s loop, 5-day announce lead,
// 2-day payment delay).
func DefaultConfig() Config {
	return Config{Tick: 30 * time.Second, Lead: 120 * time.Hour, PaymentDelay: 48 * time.Hour, MinRecordDelay: 60 * time.Second}
}

// DemoConfig is --demo-speed: a full coupon cycle on devnet in minutes.
func DemoConfig() Config {
	return Config{Tick: 5 * time.Second, Lead: 2 * time.Minute, PaymentDelay: 60 * time.Second, MinRecordDelay: 30 * time.Second, AutoFund: true}
}

// Decision kinds.
const (
	KindAnnounce = "announce" // announce a new action (Action = INTR|REDM)
	KindStep     = "step"     // run an executor step (Action = step name)
	KindWait     = "wait"     // nothing to do (Reason says why)
)

// Decision is what the scheduler wants to do with one series right now.
// Pure data: Tick composes the CLI argv (it knows the series name).
type Decision struct {
	Kind      string `json:"kind"`
	Action    string `json:"action"`              // INTR/REDM or executor step name
	RecordAt  int64  `json:"recordAt,omitempty"`  // announce only
	PaymentAt int64  `json:"paymentAt,omitempty"` // announce only
	Reason    string `json:"reason,omitempty"`    // wait only
}

// almaty is the zone the UI and all registrar surfaces show times in (KZ has no
// DST, so a fixed UTC+5 is exact); FixedZone avoids needing tzdata in the image.
var almaty = time.FixedZone("Asia/Almaty", 5*60*60)

func waitf(format string, a ...any) Decision {
	return Decision{Kind: KindWait, Reason: fmt.Sprintf(format, a...)}
}

// Decide is the pure per-series decision (unit-tested with a fake clock).
// The chain enforces every precondition anyway; these gates just keep the
// scheduler from sending transactions it knows are early.
func Decide(s *chain.Series, open *chain.CorporateAction, supply uint64, now time.Time, cfg Config) Decision {
	if open != nil {
		// Time gates only exist for the two dated steps; everything else is
		// the same status→step mapping the manual /advance endpoint uses.
		if open.Status == 0 && now.Unix() < open.RecordAt { // Announced → strike at the record date
			return waitf("record date not reached until %s", time.Unix(open.RecordAt, 0).In(almaty).Format(time.RFC3339))
		}
		if open.Status == 3 && now.Unix() < open.PaymentAt { // Funded → pay at the payment date
			return waitf("payment date not reached until %s", time.Unix(open.PaymentAt, 0).In(almaty).Format(time.RFC3339))
		}
		step, wait := executor.NextStep(open, supply, s.OpenTrades, now, cfg.AutoFund)
		if step == "" {
			return waitf("%s", wait)
		}
		return Decision{Kind: KindStep, Action: step}
	}
	if s.Status != 0 {
		return waitf("series status %d: nothing to schedule", s.Status)
	}
	if now.Unix() < s.NextCouponDate-int64(cfg.Lead.Seconds()) {
		return waitf("next coupon %s; announce at -%s",
			time.Unix(s.NextCouponDate, 0).In(almaty).Format(time.RFC3339), cfg.Lead)
	}
	// The final coupon is paid with the redemption (docs/01-product §S2).
	kind := "INTR"
	if s.NextCouponDate == s.MaturityDate {
		kind = "REDM"
	}
	// Record date = the coupon date itself (KZ law art. 31: the period's last
	// day); the floor keeps announce's now < record_at even on a late tick.
	recordAt := max(s.NextCouponDate, now.Unix()+int64(cfg.MinRecordDelay.Seconds()))
	return Decision{
		Kind: KindAnnounce, Action: kind,
		RecordAt: recordAt, PaymentAt: recordAt + int64(cfg.PaymentDelay.Seconds()),
	}
}

// Reader is the chain access the scheduler needs (satisfied by *chain.Client).
type Reader interface {
	AllSeries(ctx context.Context) ([]chain.SeriesRecord, error)
	FetchCorporateAction(ctx context.Context, pda solana.PublicKey) (*chain.CorporateAction, error)
	FetchInvestorsBySeries(ctx context.Context, series solana.PublicKey) ([]chain.InvestorRecord, error)
	FetchMint(ctx context.Context, mint solana.PublicKey) (*chain.Mint, error)
}

// Scheduler runs the tick loop. Safe as a single goroutine (no shared state).
type Scheduler struct {
	Cfg   Config
	Read  Reader
	Exec  *executor.Executor
	Store *store.Store
	Log   *slog.Logger
	Now   func() time.Time // injectable clock (tests)

	lastTick atomic.Int64 // unix nanos of the last decision pass; read by GET /admin/system
}

// Run loops until ctx is cancelled (one decision pass per Tick).
func (s *Scheduler) Run(ctx context.Context) {
	if s.Now == nil {
		s.Now = time.Now // main.go leaves it unset; a nil clock panicked on the first tick
	}
	t := time.NewTicker(max(s.Cfg.Tick, time.Second))
	defer t.Stop()
	s.Log.Info("scheduler started",
		"tick", s.Cfg.Tick.String(), "lead", s.Cfg.Lead.String(), "autofund", s.Cfg.AutoFund,
		"approval_required", s.Cfg.ApprovalRequired, "dry_run", s.Cfg.DryRun)
	for {
		select {
		case <-ctx.Done():
			s.Log.Info("scheduler stopped")
			return
		case <-t.C:
			s.Tick(ctx)
		}
	}
}

// Tick is one decision pass over every series.
func (s *Scheduler) Tick(ctx context.Context) {
	s.lastTick.Store(s.now().UnixNano())
	recs, err := s.Read.AllSeries(ctx)
	if err != nil {
		s.Log.Error("scheduler: list series", "err", err)
		return
	}
	for _, rec := range recs {
		if ctx.Err() != nil {
			return
		}
		s.handleSeries(ctx, rec)
	}
}

func (s *Scheduler) handleSeries(ctx context.Context, rec chain.SeriesRecord) {
	series := rec.Series
	now := s.now()
	var open *chain.CorporateAction
	var supply uint64
	if series.OpenAction != nil {
		a, err := s.Read.FetchCorporateAction(ctx, *series.OpenAction)
		if err != nil || a == nil {
			s.Log.Error("scheduler: fetch open action", "series", series.Mint.String(), "err", err)
			return
		}
		open = a
		mint, err := s.Read.FetchMint(ctx, series.Mint)
		if err != nil || mint == nil {
			s.Log.Error("scheduler: fetch bond mint", "series", series.Mint.String(), "err", err)
			return
		}
		supply = mint.Supply
	}
	d := Decide(series, open, supply, now, s.Cfg)
	if d.Kind == KindWait {
		s.Log.Debug("scheduler wait", "series", series.Mint.String(), "reason", d.Reason)
		return
	}
	args, index, err := s.argv(series, open, d)
	if err != nil {
		s.Log.Error("scheduler: build argv", "series", series.Mint.String(), "err", err)
		return
	}
	if s.Cfg.DryRun {
		s.Log.Info("scheduler dry-run: would run", "series", series.Mint.String(),
			"decision", fmt.Sprintf("%s:%s", d.Kind, d.Action), "args", args)
		return
	}
	if s.Cfg.ApprovalRequired {
		s.propose(ctx, series, open, d, index, args)
		return
	}
	s.execute(ctx, series.Mint.String(), d, args)
}

// argv composes the qupon CLI arguments for a decision.
func (s *Scheduler) argv(series *chain.Series, open *chain.CorporateAction, d Decision) ([]string, uint32, error) {
	name, err := s.Exec.SeriesName(series.Mint.String())
	if err != nil {
		return nil, 0, err
	}
	if d.Kind == KindAnnounce {
		return []string{
			"action:announce", "--series", name, "--kind", d.Action,
			"--record-at", strconv.FormatInt(d.RecordAt, 10),
			"--payment-at", strconv.FormatInt(d.PaymentAt, 10),
		}, series.ActionCount, nil
	}
	args, err := executor.Args(d.Action, name, open.Index)
	return args, open.Index, err
}

// propose records the decision as a pending approval (deduped per action+step).
// First it stales the series' pending rows the new decision supersedes: a
// different dedup key means the chain moved on (the old argv can never run),
// and an announce nobody approved before its record date must be re-proposed
// with fresh dates — otherwise the pending-dedup index blocks it forever.
func (s *Scheduler) propose(ctx context.Context, series *chain.Series, open *chain.CorporateAction, d Decision, index uint32, args []string) {
	row := store.Approval{
		Ts: s.Now().Unix(), SeriesMint: series.Mint.String(),
		DedupKey: fmt.Sprintf("%s|%d|%s", series.Mint.String(), index, d.Kind+":"+d.Action),
		Step:     d.Kind + ":" + d.Action, Args: args,
	}
	if open != nil {
		row.ActionPDA = series.OpenAction.String()
	}
	if err := s.staleSuperseded(ctx, row); err != nil {
		s.Log.Error("scheduler: stale approvals", "err", err) // insert may then dedup-drop; safe
	}
	if err := s.Store.InsertApproval(ctx, row); err != nil {
		s.Log.Error("scheduler: insert approval", "err", err)
		return
	}
	s.Log.Info("scheduler proposed (awaiting approval)",
		"series", series.Mint.String(), "step", row.Step, "args", args)
}

// staleSuperseded retires the series' pending rows that the incoming proposal
// replaces: dedup key differs, or it is the same announce but its --record-at
// has passed unapproved (approving it now would fail on-chain anyway).
func (s *Scheduler) staleSuperseded(ctx context.Context, row store.Approval) error {
	now := s.now().Unix()
	pending, err := s.Store.PendingSeriesApprovals(ctx, row.SeriesMint)
	if err != nil {
		return err
	}
	for _, p := range pending {
		stale := p.DedupKey != row.DedupKey
		if !stale && strings.HasPrefix(p.Step, "announce:") {
			if ra, ok := flagValue(p.Args, "--record-at"); ok {
				if t, err := strconv.ParseInt(ra, 10, 64); err == nil && t < now {
					stale = true
				}
			}
		}
		if stale {
			if err := s.Store.StaleApproval(ctx, p.ID); err != nil {
				return err
			}
			s.Log.Info("scheduler staled approval", "id", p.ID, "step", p.Step)
		}
	}
	return nil
}

// flagValue returns the token after a --flag in a stored CLI argv.
func flagValue(args []string, flag string) (string, bool) {
	for i := 0; i+1 < len(args); i++ {
		if args[i] == flag {
			return args[i+1], true
		}
	}
	return "", false
}

// execute runs one CLI step and records the outcome in the activity feed.
// A refused step (chain said TooEarly/WrongStatus…) is a warn, not an error:
// the next tick re-decides from the chain.
func (s *Scheduler) execute(ctx context.Context, mint string, d Decision, args []string) {
	res, err := s.Exec.Run(ctx, args...)
	if err != nil {
		s.Log.Error("scheduler exec", "series", mint, "step", d.Action, "err", err)
		return
	}
	if !res.OK {
		// A failed batch step may already have moved money: keep its completed
		// batch signatures in the activity feed before the retry (task 1408).
		s.recordPartialBatches(ctx, mint, d, res)
		s.Log.Warn("scheduler step refused by chain (will retry)", "series", mint, "step", d.Action, "err", res.Error)
		return
	}
	payload, _ := json.Marshal(map[string]any{"step": d.Action, "ok": true, "skipped": res.Skipped})
	mintArg := mint
	if _, err := s.Store.InsertActivity(ctx, store.Activity{
		Ts: s.Now().Unix(), SeriesMint: &mintArg, Kind: "scheduler:" + d.Action,
		Payload: payload, Sig: sigOr(d, res, s.Now()), Slot: uint64(res.Slot),
	}); err != nil {
		s.Log.Error("scheduler: record activity", "err", err)
	}
	s.Log.Info("scheduler step", "series", mint, "step", d.Action, "sig", res.Signature, "slot", res.Slot)
}

// recordPartialBatches writes one activity row per completed batch of a failed
// batch step (ok:false + partial results): those transactions already moved
// money on chain and must not vanish from the audit trail when the step is
// retried (task 1408).
func (s *Scheduler) recordPartialBatches(ctx context.Context, mint string, d Decision, res executor.Result) {
	if len(res.Results) == 0 {
		return
	}
	mintArg := mint
	for _, r := range res.Results {
		payload, _ := json.Marshal(map[string]any{"step": d.Action, "ok": false, "error": res.Error})
		if _, err := s.Store.InsertActivity(ctx, store.Activity{
			Ts: s.Now().Unix(), SeriesMint: &mintArg, Kind: "scheduler:" + d.Action,
			Payload: payload, Sig: r.Signature, Slot: uint64(r.Slot),
		}); err != nil {
			s.Log.Error("scheduler: record partial activity", "err", err)
		}
	}
}

// now returns the injectable clock (Run sets it), falling back to wall time for direct Tick calls in tests.
func (s *Scheduler) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// LastTick reports when the last decision pass started (zero before the first tick) — GET /admin/system.
func (s *Scheduler) LastTick() time.Time {
	if n := s.lastTick.Load(); n > 0 {
		return time.Unix(0, n)
	}
	return time.Time{}
}

func sigOr(d Decision, res executor.Result, now time.Time) string {
	if res.Signature != "" {
		return res.Signature
	}
	return fmt.Sprintf("scheduler-%s-%d", d.Action, now.UnixNano())
}
