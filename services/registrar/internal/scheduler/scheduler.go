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
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"slices"
	"strconv"
	"strings"
	"sync"
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
		step, wait := executor.NextStep(open, s, supply, now, cfg.AutoFund)
		if step == "" {
			return waitf("%s", wait)
		}
		return Decision{Kind: KindStep, Action: step}
	}
	if s.Status != 0 {
		return waitf("series status %d: nothing to schedule", s.Status)
	}
	// Demo series (plan 15 D7): the same 5-day announce lead and 2-day payment delay, counted in
	// series-days — a day_secs = 1 series announces 5 s ahead and pays 2 s after the record date,
	// not after two real days. The record floor stays wall-clock, though: announce checks
	// now < record_at on chain, and one CLI run needs seconds of real time to land (executor queue
	// + devnet confirm), so a one-series-day floor (1 s) failed every announce of a 1 s-day series
	// with InvalidDates (task 91556).
	lead, delay, floor := cfg.Lead, cfg.PaymentDelay, cfg.MinRecordDelay
	if s.DaySecs > 0 {
		day := time.Duration(s.DaySecs) * time.Second
		lead, delay = 5*day, 2*day
		floor = max(floor, announceFloor)
	}
	if now.Unix() < s.NextCouponDate-int64(lead.Seconds()) {
		return waitf("next coupon %s; announce at -%s",
			time.Unix(s.NextCouponDate, 0).In(almaty).Format(time.RFC3339), lead)
	}
	// The final coupon is paid with the redemption (docs/01-product §S2).
	kind := "INTR"
	if s.NextCouponDate == s.MaturityDate {
		kind = "REDM"
	}
	// Record date = the coupon date itself (KZ law art. 31: the period's last
	// day); the floor keeps announce's now < record_at even on a late tick.
	recordAt := max(s.NextCouponDate, now.Unix()+int64(floor.Seconds()))
	return Decision{
		Kind: KindAnnounce, Action: kind,
		RecordAt: recordAt, PaymentAt: recordAt + int64(delay.Seconds()),
	}
}

// Reader is the chain access the scheduler needs (satisfied by *chain.Client).
type Reader interface {
	AllSeries(ctx context.Context) ([]chain.SeriesRecord, error)
	FetchCorporateAction(ctx context.Context, pda solana.PublicKey) (*chain.CorporateAction, error)
	FetchInvestorsBySeries(ctx context.Context, series solana.PublicKey) ([]chain.InvestorRecord, error)
	FetchMint(ctx context.Context, mint solana.PublicKey) (*chain.Mint, error)
	// FetchEntitlementsByAction feeds the sandbox bank confirm (which holders sit at PaidToAgent).
	FetchEntitlementsByAction(ctx context.Context, action solana.PublicKey) ([]chain.EntitlementRecord, error)
}

type Scheduler struct {
	Cfg   Config
	Read  Reader
	Exec  *executor.Executor
	Store *store.Store
	Log   *slog.Logger
	Now   func() time.Time // injectable clock (tests)
	// Attach, when set, anchors the seev.031 of a just-announced action on chain
	// (plan 15 D9; wired to disclosure.Deps.Attach in main.go). nil = off (tests).
	Attach func(ctx context.Context, actionPDA solana.PublicKey)

	tick     *time.Ticker // non-nil once Run started; shortened while a demo series is open
	lastTick atomic.Int64 // unix nanos of the last decision pass; read by GET /admin/system

	// Task 91563: chain refusals back off exponentially instead of retrying every tick,
	// and the autopilot only drives series it owns. skippedMints logs a skip once.
	backoffMu    sync.Mutex
	backoffs     map[string]*refusal // mint → the refused step, its attempt count and next-try time
	skippedMints map[string]bool
}

// Refusal backoff schedule: 10 s, doubling, capped at 15 min. Reset when the
// step succeeds or the series' decision moves to another step.
const (
	refusalBase = 10 * time.Second
	refusalCap  = 15 * time.Minute
)

// refusal is the backoff state of one series' currently failing step.
type refusal struct {
	step    string
	attempt int // completed backoffs so far
	nextTry time.Time
}

// canRun: the (mint, step) pair is past its backoff (or never refused).
func (s *Scheduler) canRun(mint, step string, now time.Time) bool {
	s.backoffMu.Lock()
	defer s.backoffMu.Unlock()
	r := s.backoffs[mint]
	return r == nil || r.step != step || !now.Before(r.nextTry)
}

// recordRefusal arms the backoff and returns (delay, first). A changed step
// restarts the schedule — the chain moved on, the old failure is stale.
func (s *Scheduler) recordRefusal(mint, step string, now time.Time) (time.Duration, bool) {
	s.backoffMu.Lock()
	defer s.backoffMu.Unlock()
	if s.backoffs == nil {
		s.backoffs = map[string]*refusal{}
	}
	r, ok := s.backoffs[mint]
	if !ok || r.step != step {
		r, ok = &refusal{step: step}, false
	}
	delay := refusalBase << min(r.attempt, 7)
	if delay > refusalCap {
		delay = refusalCap
	}
	r.attempt++
	r.nextTry = now.Add(delay)
	s.backoffs[mint] = r
	return delay, !ok
}

// clearBackoff resets the schedule after a success (or any state change worth
func (s *Scheduler) clearBackoff(mint string) {
	s.backoffMu.Lock()
	defer s.backoffMu.Unlock()
	delete(s.backoffs, mint)
}

// firstSkip marks an unowned mint as skipped and reports whether this is the
// first tick it was seen unowned (the skip is logged once, not every tick).
func (s *Scheduler) firstSkip(mint string) bool {
	s.backoffMu.Lock()
	defer s.backoffMu.Unlock()
	if s.skippedMints == nil {
		s.skippedMints = map[string]bool{}
	}
	if s.skippedMints[mint] {
		return false
	}
	s.skippedMints[mint] = true
	return true
}

// Run loops until ctx is cancelled (one decision pass per Tick).
func (s *Scheduler) Run(ctx context.Context) {
	if s.Now == nil {
		s.Now = time.Now // main.go leaves it unset; a nil clock panicked on the first tick
	}
	t := time.NewTicker(max(s.Cfg.Tick, time.Second))
	s.tick = t
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

// demoTick is the loop period while any Active demo series exists (plan 15 D7): a civil day can be
// one second, so a 30 s tick would sleep through whole coupon periods.
const demoTick = 2 * time.Second

// announceFloor is the wall-clock margin a demo series keeps between now and record_at: the CLI
// run that announces takes seconds of real time to land on devnet, and the program checks
// now < record_at at execution (task 91556).
const announceFloor = 60 * time.Second

// Tick is one decision pass over every series.
func (s *Scheduler) Tick(ctx context.Context) {
	s.lastTick.Store(s.now().UnixNano())
	owned, err := s.ownedMints(ctx)
	if err != nil {
		s.Log.Error("scheduler: owned series", "err", err) // drive everything, the pre-91563 behaviour
		owned = nil
	}
	recs, err := s.listSeries(ctx, owned)
	if err != nil {
		s.Log.Error("scheduler: list series", "err", err)
		return
	}
	if s.tick != nil && s.Cfg.Tick > demoTick && anyDemoSeriesOpen(recs) {
		s.tick.Reset(demoTick) // stays fast until the service restarts; harmless when no demo series remains
	}
	// Per-series scenario (plan 15, task 1522): no_autofund series never get funded by the autopilot, so they default.
	var noFund map[string]bool
	if s.Store != nil {
		if noFund, err = s.Store.NoAutofundSeries(ctx); err != nil {
			s.Log.Error("scheduler: series scenarios", "err", err) // fall back to the global autofund
		}
	}
	s.prefetch(ctx, recs, owned)
	for _, rec := range recs {
		if ctx.Err() != nil {
			return
		}
		mint := rec.Series.Mint.String()
		if owned != nil && !owned[mint] {
			if s.firstSkip(mint) {
				s.Log.Info("scheduler: skipping series the autopilot does not own (no registry row, sandbox or showcase feature)", "series", mint)
			}
			continue
		}
		s.handleSeries(ctx, rec, noFund[mint])
	}
}

// listSeries reads the series to drive: with an owned set and a chain.Client only those accounts
// (getMultipleAccounts), otherwise a full scan (tests, no store, or the owned lookup failed).
func (s *Scheduler) listSeries(ctx context.Context, owned map[string]bool) ([]chain.SeriesRecord, error) {
	r, ok := s.Read.(interface {
		SeriesByMints(ctx context.Context, mints []solana.PublicKey) ([]chain.SeriesRecord, error)
	})
	if !ok || owned == nil {
		return s.Read.AllSeries(ctx)
	}
	mints := make([]solana.PublicKey, 0, len(owned))
	for m := range owned {
		if k, err := solana.PublicKeyFromBase58(m); err == nil { // a malformed store row never blocks the rest
			mints = append(mints, k)
		}
	}
	slices.SortFunc(mints, func(a, b solana.PublicKey) int { return bytes.Compare(a[:], b[:]) })
	return r.SeriesByMints(ctx, mints)
}

// prefetch batches the open actions and bond mints handleSeries reads into one getMultipleAccounts per tick
// (chain.Client only; nil owned = every series). On failure handleSeries falls back to single reads.
func (s *Scheduler) prefetch(ctx context.Context, recs []chain.SeriesRecord, owned map[string]bool) {
	p, ok := s.Read.(interface {
		Prefetch(ctx context.Context, keys []solana.PublicKey) error
	})
	if !ok {
		return
	}
	var keys []solana.PublicKey
	for _, r := range recs {
		if r.Series.OpenAction != nil && (owned == nil || owned[r.Series.Mint.String()]) {
			keys = append(keys, *r.Series.OpenAction, r.Series.Mint)
		}
	}
	if len(keys) == 0 {
		return
	}
	if err := p.Prefetch(ctx, keys); err != nil {
		s.Log.Warn("scheduler: prefetch", "err", err)
	}
}

// ownedMints: the series the autopilot drives — a registry row, a sandbox row,
// or a curated showcase mint. A nil map (no store) drives everything.
func (s *Scheduler) ownedMints(ctx context.Context) (map[string]bool, error) {
	if s.Store == nil {
		return nil, nil
	}
	reg, err := s.Store.ListRegistry(ctx)
	if err != nil {
		return nil, err
	}
	out := map[string]bool{}
	for _, r := range reg {
		out[r.Mint] = true
	}
	set, err := s.Store.ListSeriesSettings(ctx)
	if err != nil {
		return nil, err
	}
	for mint, x := range set {
		if x.Featured || x.SandboxID != "" {
			out[mint] = true
		}
	}
	return out, nil
}

// anyDemoSeriesOpen: an Active series whose clock runs on compressed days.
func anyDemoSeriesOpen(recs []chain.SeriesRecord) bool {
	for _, r := range recs {
		if r.Series.DaySecs > 0 && r.Series.Status == 0 {
			return true
		}
	}
	return false
}

func (s *Scheduler) handleSeries(ctx context.Context, rec chain.SeriesRecord, noAutofund bool) {
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
	cfg := s.Cfg
	if noAutofund {
		cfg.AutoFund = false
	}
	d := Decide(series, open, supply, now, cfg)
	if d.Kind == KindWait {
		// A judge sandbox walks to maturity unattended: when the only thing left is the paying
		// agent's bank confirmation, the autopilot plays that agent with a SIMULATED reference
		// (task 91556). Real series keep the manual POST /actions/{pda}/confirm-bank.
		if open != nil && open.BankPending > 0 && series.OpenAction != nil {
			s.confirmSandboxBank(ctx, series.Mint.String(), *series.OpenAction, open)
		}
		s.Log.Debug("scheduler wait", "series", series.Mint.String(), "reason", d.Reason)
		return
	}
	args, index, err := s.argv(series, open, d)
	if err != nil {
		s.Log.Error("scheduler: build argv", "series", series.Mint.String(), "err", err)
		return
	}
	// Task 1524 (1532 contract): on a sandbox whose visitor joined with a wallet, leave that holder's payout
	// unpaid ~60 s so the page's Claim button has a window (the autopilot pays everyone else immediately).
	if d.Action == executor.StepPay && open != nil {
		args = s.claimWindow(ctx, series.Mint.String(), open.Index, args)
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
	s.execute(ctx, series.Mint.String(), d, args, series.OpenAction)
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

// claimWindow appends `--skip-owner <wallet>` to a sandbox's pay step while the visitor's claim window is
// open. A fresh row (claim_until = 0) or one armed for an earlier action both mean "not armed for this
// action": action indexes start at 0, so claim_index = 0 alone cannot say "armed" (round-2 review fix).
// Arming writes now+60, so claim_until is never 0 again once armed.
func (s *Scheduler) claimWindow(ctx context.Context, mint string, index uint32, args []string) []string {
	sbx, err := s.Store.SandboxByMint(ctx, mint)
	if err != nil || sbx == nil || sbx.Wallet == "" {
		return args
	}
	now := s.now().Unix()
	if sbx.ClaimUntil == 0 || sbx.ClaimIndex != index {
		if err := s.Store.ArmSandboxClaim(ctx, sbx.ID, index, now+60); err != nil {
			s.Log.Error("scheduler: arm sandbox claim window", "sandbox", sbx.ID, "err", err)
			return args
		}
		return append(args, "--skip-owner", sbx.Wallet)
	}
	if now < sbx.ClaimUntil {
		return append(args, "--skip-owner", sbx.Wallet)
	}
	return args
}

// confirmSandboxBank plays the paying agent for a judge sandbox whose coupon is fully paid except the
// bank-routed holders (plan 15 D6: PaidToAgent awaits confirmation). The web mock confirms right after
// the pay step, so an unattended sandbox must too; the transfer reference is SIMULATED (task 91556).
// Real series never pass through here — only mints tied to a sandbox row do.
func (s *Scheduler) confirmSandboxBank(ctx context.Context, mint string, action solana.PublicKey, open *chain.CorporateAction) {
	if s.Store == nil {
		return
	}
	sbx, err := s.Store.SandboxByMint(ctx, mint)
	if err != nil || sbx == nil {
		return
	}
	name, err := s.Exec.SeriesName(mint)
	if err != nil {
		s.Log.Error("scheduler: sandbox bank confirm: series name", "series", mint, "err", err)
		return
	}
	recs, err := s.Read.FetchEntitlementsByAction(ctx, action)
	if err != nil {
		s.Log.Error("scheduler: sandbox bank confirm: entitlements", "series", mint, "err", err)
		return
	}
	for _, rec := range recs {
		if rec.Entitlement.Status != 3 { // 3 = PaidToAgent: paid to the paying agent, awaiting the bank transfer
			continue
		}
		owner := rec.Entitlement.Owner.String()
		reference := fmt.Sprintf("SANDBOX-%s-%d-%s (SIMULATED)", name, open.Index, owner[:8])
		args := []string{"payout:confirm-bank", "--series", name,
			"--index", strconv.FormatUint(uint64(open.Index), 10), "--owner", owner, "--reference", reference}
		res, err := s.Exec.Run(ctx, args...)
		if err != nil {
			s.Log.Error("scheduler: sandbox bank confirm", "series", mint, "owner", owner, "err", err)
			return // a spawn/contract failure: retry next tick
		}
		if !res.OK {
			s.Log.Warn("scheduler: sandbox bank confirm refused (will retry)", "series", mint, "owner", owner, "err", res.Error)
			return
		}
		payload, _ := json.Marshal(map[string]any{"step": executor.StepConfirmBank, "ok": true, "sandbox": sbx.ID})
		mintArg := mint
		apda := action.String()
		if _, err := s.Store.InsertActivity(ctx, store.Activity{
			Ts: s.Now().Unix(), SeriesMint: &mintArg, ActionPDA: &apda, Kind: "scheduler:" + executor.StepConfirmBank,
			Payload: payload, Sig: res.Signature, Slot: uint64(res.Slot),
		}); err != nil {
			s.Log.Error("scheduler: record sandbox bank confirm", "err", err)
		}
		s.Log.Info("scheduler step", "series", mint, "step", executor.StepConfirmBank, "owner", owner, "sig", res.Signature, "slot", res.Slot)
	}
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
			if ra, ok := executor.FlagValue(p.Args, "--record-at"); ok {
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

// FlagValue (executor) returns the token after a --flag in a stored CLI argv.

// execute runs one CLI step and records the outcome in the activity feed.
// A refused step (chain said TooEarly/WrongStatus…) backs off exponentially
// (task 91563) instead of retrying on every tick; the first refusal is a WARN,
// repeats are DEBUG.
func (s *Scheduler) execute(ctx context.Context, mint string, d Decision, args []string, actionPda *solana.PublicKey) {
	now := s.now()
	if !s.canRun(mint, d.Action, now) {
		s.Log.Debug("scheduler step backing off after refusal", "series", mint, "step", d.Action)
		return
	}
	res, err := s.Exec.Run(ctx, args...)
	if err != nil {
		s.Log.Error("scheduler exec", "series", mint, "step", d.Action, "err", err)
		return
	}
	if !res.OK {
		// A failed batch step may already have moved money: keep its completed
		// batch signatures in the activity feed before the retry (task 1408).
		s.recordPartialBatches(ctx, mint, d, res)
		delay, first := s.recordRefusal(mint, d.Action, s.now())
		if first {
			s.Log.Warn("scheduler step refused by chain (will retry)", "series", mint, "step", d.Action,
				"err", res.Error, "retry_in", delay.String())
		} else {
			s.Log.Debug("scheduler step refused by chain (backing off)", "series", mint, "step", d.Action,
				"err", res.Error, "retry_in", delay.String())
		}
		// A sandbox series whose coupon is blocked by an admitted DvP trade can never
		// proceed until it is released — the autopilot cancels the stale trades itself.
		if strings.Contains(res.Error, "TradesInFlight") {
			s.releaseStaleTrades(ctx, mint)
		}
		return
	}
	s.clearBackoff(mint)
	payload, _ := json.Marshal(map[string]any{"step": d.Action, "ok": true, "skipped": res.Skipped})
	mintArg := mint
	if _, err := s.Store.InsertActivity(ctx, store.Activity{
		Ts: s.Now().Unix(), SeriesMint: &mintArg, Kind: "scheduler:" + d.Action,
		Payload: payload, Sig: sigOr(d, res, s.Now()), Slot: uint64(res.Slot),
	}); err != nil {
		s.Log.Error("scheduler: record activity", "err", err)
	}
	s.Log.Info("scheduler step", "series", mint, "step", d.Action, "sig", res.Signature, "slot", res.Slot)
	// Plan 15 D9: right after a successful announce, anchor the official
	// seev.031 notification on the new action (best-effort, idempotent).
	if d.Kind == KindAnnounce && s.Attach != nil && res.Action != "" {
		if pda, err := solana.PublicKeyFromBase58(res.Action); err == nil {
			s.Attach(ctx, pda)
		}
	}
	// Task 1414: a finished action's escrow goes back to the issuer right after the
	// finishing step — complete/close clear series.open_action, so no later tick
	// would find the action again.
	if d.Action == executor.StepComplete || d.Action == executor.StepClose {
		s.sweep(ctx, mint, args, actionPda)
	}
}

// releaseStaleTrades cancels every admitted DvP trade of a sandbox series
// (task 91563): an admission blocks the next record date with TradesInFlight,
// and on a sandbox the trades are demo artifacts the autopilot owns. Best
// effort — a refused cancel just keeps the backoff running.
func (s *Scheduler) releaseStaleTrades(ctx context.Context, mint string) {
	if s.Store == nil {
		return
	}
	sbx, err := s.Store.SandboxByMint(ctx, mint)
	if err != nil || sbx == nil {
		return // real series: the operator settles or cancels (docs/03-domain.md §4a)
	}
	name, err := s.Exec.SeriesName(mint)
	if err != nil {
		s.Log.Error("scheduler: stale trades: series name", "series", mint, "err", err)
		return
	}
	raw, err := s.Exec.RunRaw(ctx, "trade:list", "--series", name)
	if err != nil {
		s.Log.Error("scheduler: stale trades: trade:list", "series", mint, "err", err)
		return
	}
	var list struct {
		Trades []map[string]any `json:"trades"`
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	if err := dec.Decode(&list); err != nil {
		s.Log.Error("scheduler: stale trades: parse trade:list", "series", mint, "err", err)
		return
	}
	for _, t := range list.Trades {
		swap, _ := t["swapDvp"].(string)
		if swap == "" {
			continue
		}
		res, err := s.Exec.Run(ctx, "trade:cancel", "--series", name, "--trade", swap)
		if err != nil {
			s.Log.Error("scheduler: stale trade cancel", "series", mint, "trade", swap, "err", err)
			return
		}
		if !res.OK {
			s.Log.Warn("scheduler: stale trade cancel refused (will retry)", "series", mint, "trade", swap, "err", res.Error)
			return
		}
		s.Log.Info("scheduler: released stale admitted trade", "series", mint, "trade", swap, "sig", res.Signature)
	}
}

// sweep runs `qupon action:sweep` for a just-finished action (task 1414). Best
// effort: a failed sweep is logged and swallowed — the finished action stays
// finished — and an already-swept escrow (CLI skip) records no activity row.
func (s *Scheduler) sweep(ctx context.Context, mint string, doneArgs []string, actionPda *solana.PublicKey) {
	name, okName := executor.FlagValue(doneArgs, "--series")
	idx, okIdx := executor.FlagValue(doneArgs, "--index")
	index, err := strconv.ParseUint(idx, 10, 32)
	if !okName || !okIdx || err != nil {
		s.Log.Error("scheduler: sweep: cannot rebuild argv from the finished step", "args", doneArgs, "err", err)
		return
	}
	args, err := executor.Args(executor.StepSweep, name, uint32(index))
	if err != nil {
		s.Log.Error("scheduler: sweep argv", "series", mint, "err", err)
		return
	}
	res, err := s.Exec.Run(ctx, args...)
	if err != nil {
		s.Log.Warn("scheduler: escrow sweep failed (action stays finished)", "series", mint, "err", err)
		return
	}
	if !res.OK {
		s.Log.Warn("scheduler: escrow sweep refused (action stays finished)", "series", mint, "err", res.Error)
		return
	}
	if res.Skipped {
		return // already swept (e.g. REDM: swept after complete, close re-runs the follow-up)
	}
	payload, _ := json.Marshal(map[string]any{"step": executor.StepSweep, "ok": true})
	mintArg := mint
	row := store.Activity{
		Ts: s.Now().Unix(), SeriesMint: &mintArg, Kind: "scheduler:" + executor.StepSweep,
		Payload: payload, Sig: sigOr(Decision{Action: executor.StepSweep}, res, s.Now()), Slot: uint64(res.Slot),
	}
	if actionPda != nil {
		p := actionPda.String()
		row.ActionPDA = &p
	}
	if _, err := s.Store.InsertActivity(ctx, row); err != nil {
		s.Log.Error("scheduler: record sweep activity", "err", err)
	}
	s.Log.Info("scheduler step", "series", mint, "step", executor.StepSweep, "sig", res.Signature, "slot", res.Slot)
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
