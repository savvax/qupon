// Package executor runs `qupon` CLI lifecycle steps (docs/02-architecture.md
// §Go registrar service): the service never re-implements program logic, it
// calls the CLI and verifies the chain afterwards. JSON contract on stdout:
// {ok, signature, slot} on success; non-zero exit with the message on stderr
// on failure — except a failed batch command, which exits non-zero with
// {ok:false, error, results:[completed batches]} on stdout so the completed
// signatures are not lost (task 1408). Every run is capped at 120 s; batch
// instructions are idempotent on-chain, so re-running a step is safe.
package executor

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
)

// Timeout is the hard cap for one CLI invocation (batch commands send
// sequential transactions; devnet latency dominates).
const Timeout = 120 * time.Second

// Step names (instruction-style, openapi.yaml AdvanceResponse.step).
const (
	StepStrike     = "strike_record"
	StepSnapshot   = "snapshot_batch"
	StepFinalize   = "finalize_snapshot"
	StepFund       = "fund_action"
	StepPay        = "pay_batch"
	StepComplete   = "complete_action"
	StepRetire     = "retire_batch"
	StepClose      = "close_series"
	StepMeetFinal  = "meeting_finalize"
	StepApplyTerms = "apply_terms_change"
	StepSweep      = "sweep_escrow"
	// Plan 15: anyone declares a default once it is due (D4); the paying agent confirms a bank payout (D6) —
	// an operator action from the console (it needs the transfer reference), never taken by the autopilot.
	StepDefault     = "declare_default"
	StepConfirmBank = "confirm_bank_payout"
)

// cliCommand maps a step to its `qupon` CLI command (clients/ts/src/cli.ts).
var cliCommand = map[string]string{
	StepStrike:     "action:strike",
	StepSnapshot:   "action:snapshot",
	StepFinalize:   "action:finalize-snapshot",
	StepFund:       "action:fund",
	StepPay:        "action:pay",
	StepComplete:   "action:complete",
	StepRetire:     "action:retire",
	StepClose:      "series:close",
	StepMeetFinal:  "meeting:finalize",
	StepApplyTerms: "meeting:apply",
	StepSweep:      "action:sweep",
	StepDefault:    "action:default",
	// payout:confirm-bank also needs --owner and --reference (the console adds them).
	StepConfirmBank: "payout:confirm-bank",
}

// Args builds the CLI argv for a step. Every lifecycle command takes
// --series <name> and --index <n> (the action to advance).
func Args(step, series string, index uint32) ([]string, error) {
	cmd, ok := cliCommand[step]
	if !ok {
		return nil, fmt.Errorf("unknown step %q", step)
	}
	return []string{cmd, "--series", series, "--index", strconv.FormatUint(uint64(index), 10)}, nil
}

// FlagValue returns the token after a --flag in a stored CLI argv — the
// inverse of Args (approvals rebuild the series/index from the argv they ran).
func FlagValue(args []string, flag string) (string, bool) {
	for i := 0; i+1 < len(args); i++ {
		if args[i] == flag {
			return args[i+1], true
		}
	}
	return "", false
}

// Result is the CLI JSON contract: {ok, signature, slot, error}. The CLI
// serializes bigint slots as strings; both spellings are accepted.
type Result struct {
	OK        bool       `json:"ok"`
	Signature string     `json:"signature"`
	Slot      flexUint64 `json:"slot"`
	Error     string     `json:"error"`
	// Skipped is true for a boolean skip (action:fund with a full escrow) and for
	// the CLI's skip-reason strings (action:sweep → "already swept").
	Skipped flexBool `json:"skipped"`
	// Command-specific passthrough fields the CLI merges into its JSON output.
	Investor    string `json:"investor"`    // investor:register — the new Investor PDA
	Attestation string `json:"attestation"` // kyc:attest — the SAS attestation PDA
	Action      string `json:"action"`      // action:announce / meeting:announce — the CorporateAction PDA
	Ata         string `json:"ata"`         // asset:faucet — the funded associated token account
	// trade:create — the Solana DvP SwapDvp record; trade:cancel — bond units handed back to the seller.
	SwapDvp       string     `json:"swapDvp"`
	ReturnedUnits flexUint64 `json:"returnedUnits"`
	// Batch commands (snapshot/pay/retire) print {ok, results:[{signature, slot}…]} instead of one signature.
	Results []struct {
		Signature string     `json:"signature"`
		Slot      flexUint64 `json:"slot"`
	} `json:"results"`
	// series:create prints {ok, series, mint, signatures:[…]} instead of one signature.
	Series     string   `json:"series"`
	Mint       string   `json:"mint"`
	Signatures []string `json:"signatures"`
}

// Executor execs the qupon CLI. Safe for concurrent use (no shared state).
type Executor struct {
	bin     string        // $QUPON_CLI
	cfgPath string        // writable config the executor regenerates (base + series registry)
	timeout time.Duration // per-invocation cap (Timeout)
	log     *slog.Logger
	slots   chan struct{} // at most cap(slots) CLI processes at once (1 vCPU box); others queue on their context
	waiting atomic.Int64  // runs blocked on a free slot — Stats reports them as queued (/admin/system)
}

// MaxConcurrent bounds parallel CLI runs: each is a node process, and a burst of writes must not exhaust the host.
const MaxConcurrent = 2

// keyParam matches API keys in URLs the CLI may print (a keyed RPC endpoint); CLI output reaches response bodies.
var keyParam = regexp.MustCompile(`(?i)(api[-_]?key=)[^&\s"'<>]+`)

func redactKeys(s string) string { return keyParam.ReplaceAllString(s, "${1}…") }

// secretFlags carry bank details or transfer references (plan 15 D6): only their sha256 goes on-chain, so the clear
// text must not reach the registrar's logs either.
var secretFlags = map[string]bool{"--reference": true, "--bank-ref": true}

// logArgs is args with the values of secretFlags masked.
func logArgs(args []string) []string {
	out := slices.Clone(args)
	for i := 0; i+1 < len(out); i++ {
		if secretFlags[out[i]] {
			out[i+1] = "…"
		}
	}
	return out
}

// New builds an Executor (bin from cfg, config for series-name resolution).
func New(bin, cfgPath string, logger *slog.Logger) *Executor {
	if logger == nil {
		logger = slog.Default()
	}
	return &Executor{bin: bin, cfgPath: cfgPath, timeout: Timeout, log: logger, slots: make(chan struct{}, MaxConcurrent)}
}

// ConfigPath is the writable executor config path (the execconfig.Write target).
func (e *Executor) ConfigPath() string { return e.cfgPath }

// flexUint64 accepts both 123 and "123" (the CLI serializes bigint slots
// as strings).
type flexUint64 uint64

func (f *flexUint64) UnmarshalJSON(b []byte) error {
	s := strings.Trim(strings.TrimSpace(string(b)), `"`)
	n, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return fmt.Errorf("slot %s: %w", string(b), err)
	}
	*f = flexUint64(n)
	return nil
}

// flexBool accepts true/false and the CLI's skip-reason strings ("already
// swept") — any non-empty, non-false string is a skip.
type flexBool bool

func (f *flexBool) UnmarshalJSON(b []byte) error {
	s := strings.Trim(strings.TrimSpace(string(b)), `"`)
	*f = flexBool(s == "true" || (s != "false" && s != "null" && s != ""))
	return nil
}

// Stats reports how many CLI runs are executing and how many are queued for a free slot (GET /admin/system).
func (e *Executor) Stats() (running, queued int) {
	return len(e.slots), int(e.waiting.Load())
}

// Run execs `bin --json args…`. A CLI failure (non-zero exit) is a normal
// Result{OK:false, Error:…}; only spawn/timeout/contract failures return a
// Go error.
func (e *Executor) Run(ctx context.Context, args ...string) (Result, error) {
	e.waiting.Add(1)
	select {
	case e.slots <- struct{}{}:
		e.waiting.Add(-1)
		defer func() { <-e.slots }()
	case <-ctx.Done():
		e.waiting.Add(-1)
		return Result{}, fmt.Errorf("cli %s: waiting for a free executor slot: %w", strings.Join(args, " "), ctx.Err())
	}
	res, err := e.run(ctx, args...)
	res.Error = redactKeys(res.Error)
	if err != nil && keyParam.MatchString(err.Error()) {
		err = errors.New(redactKeys(err.Error()))
	}
	return res, err
}

func (e *Executor) run(ctx context.Context, args ...string) (Result, error) {
	runCtx, cancel := context.WithTimeout(ctx, e.timeout)
	defer cancel()
	full := append([]string{"--json"}, args...)
	// The binary path is operator config ($QUPON_CLI), never request input —
	// the args are executor-built constants (step name, series, index).
	cmd := exec.CommandContext(runCtx, e.bin, full...) // nosemgrep: go.lang.security.audit.dangerous-exec-command.dangerous-exec-command — operator config, not request input
	cmd.Env = append(os.Environ(), "QUPON_CONFIG="+e.cfgPath)
	// The CLI is usually a shell shim around node: on timeout kill the whole process group, or node keeps stdout
	// open and Wait blocks past the cap. WaitDelay is the backstop if a descendant escapes the group.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error { return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }
	cmd.WaitDelay = 2 * time.Second
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	if runCtx.Err() != nil {
		// Only the per-run cap is a timeout. A parent cancellation (client disconnect,
		// shutdown) is a different failure: handlers detach the CLI from the request
		// context, but the scheduler passes its own — report what actually happened.
		if errors.Is(runCtx.Err(), context.DeadlineExceeded) {
			return Result{}, fmt.Errorf("cli %s timed out after %s: %w", strings.Join(args, " "), e.timeout, runCtx.Err())
		}
		return Result{}, fmt.Errorf("cli %s cancelled: %w", strings.Join(args, " "), runCtx.Err())
	}
	if err != nil {
		// Contract violation on the happy path is fatal; a failed step is data.
		var res Result
		if jerr := json.Unmarshal(bytes.TrimSpace(stdout.Bytes()), &res); jerr == nil && res.Error != "" {
			res.OK = false
			return res, nil
		}
		msg := lastLine(stderr.String())
		if msg == "" {
			msg = fmt.Sprintf("cli exited: %v", err)
		}
		return Result{OK: false, Error: msg}, nil
	}
	var res Result
	if jerr := json.Unmarshal(bytes.TrimSpace(stdout.Bytes()), &res); jerr != nil {
		return Result{}, fmt.Errorf("cli %s stdout is not the JSON contract (%q): %w", strings.Join(args, " "), strings.TrimSpace(stdout.String()), jerr)
	}
	if !res.OK && res.Error == "" {
		res.Error = "cli reported ok:false without an error message"
	}
	if res.Signature == "" && len(res.Results) > 0 { // batch: report the last batch's transaction
		last := res.Results[len(res.Results)-1]
		res.Signature, res.Slot = last.Signature, last.Slot
	}
	e.log.Info("cli step", "cmd", strings.Join(logArgs(args), " "), "ok", res.OK, "sig", res.Signature, "slot", res.Slot)
	return res, nil
}

func lastLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	return strings.TrimSpace(lines[len(lines)-1])
}

// quponConfig is the slice of config/devnet.json the executor needs.
type quponConfig struct {
	Series map[string]struct {
		Mint string `json:"mint"`
	} `json:"series"`
}

// SeriesName resolves the CLI --series name for a bond mint. Read per call:
// advances are rare and config edits (new demo series) apply without restart.
func (e *Executor) SeriesName(mint string) (string, error) {
	raw, err := os.ReadFile(e.cfgPath)
	if err != nil {
		return "", fmt.Errorf("read qupon config: %w", err)
	}
	var cfg quponConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return "", fmt.Errorf("parse %s: %w", e.cfgPath, err)
	}
	for name, sc := range cfg.Series {
		if sc.Mint == mint {
			return name, nil
		}
	}
	return "", fmt.Errorf("mint %s is not a series in %s", mint, e.cfgPath)
}

// NextStep maps the on-chain action status to the next CLI step
// (task 023 / docs §Data flow). Returns ("", reason) when the action must
// wait or has no runnable step — the chain stays the source of truth for
// timing (TooEarly etc. surfaces as a CLI error, not a service rule).
//
// supply is the bond mint supply: finalize_snapshot requires units_snapshotted == supply, and the program skips
// zero-balance accounts, so counting registered investors would snapshot forever once one holds no bonds.
//
// openTrades is Series.open_trades: strike_record fails with TradesInFlight while a secondary trade is admitted
// (docs/03-domain.md §4a). The operator settles or cancels them; nothing here does it for them.
func NextStep(a *chain.CorporateAction, s *chain.Series, supply uint64, now time.Time, autofund bool) (step, wait string) {
	switch a.Status {
	case 0: // Announced
		if s.Hook == 1 {
			// Plan 15 D1': no strike — the transfer-hook gate arms itself at record_at and the first snapshot batch
			// strikes lazily; trades in flight are handled by the gate, not by the operator.
			if now.Unix() < a.RecordAt {
				return "", "record date not reached (the transfer-hook gate arms at record_at)"
			}
			return snapshotOrFinalize(a, s, supply)
		}
		if s.OpenTrades > 0 {
			return "", fmt.Sprintf("open secondary trades: settle or cancel them first (%d)", s.OpenTrades)
		}
		return StepStrike, ""
	case 1: // RecordStruck: snapshot until every outstanding unit is in the snapshot
		return snapshotOrFinalize(a, s, supply)
	case 2: // SnapshotComplete: issuer funds; autofund drives the demo; past the deadline anyone declares a default
		if autofund {
			return StepFund, ""
		}
		if due := DefaultDue(a, s); now.Unix() >= due {
			return StepDefault, ""
		}
		return "", "waiting for issuer funding (re-run with autofund:true); a default is due at " +
			time.Unix(DefaultDue(a, s), 0).UTC().Format(time.RFC3339)
	case 10: // Defaulted (plan 15 D4): the issuer's late funding cures it
		if autofund {
			return StepFund, ""
		}
		return "", "in default: the issuer's late funding cures it (re-run with autofund:true)"
	case 3: // Funded
		return StepPay, ""
	case 4: // Settling: pay until every holder is paid, then complete
		if a.HoldersPaid < a.HoldersSnapshotted {
			return StepPay, ""
		}
		if a.BankPending > 0 { // plan 15 D6: complete_action refuses while bank payouts await confirmation
			return "", fmt.Sprintf("%d bank payout(s) await the paying agent's confirmation", a.BankPending)
		}
		return StepComplete, ""
	case 5: // Completed: the escrow goes back to the issuer (idempotent — a re-run is a skip)
		return StepSweep, ""
	case 6: // Retiring: burn until every holder is retired, then close
		if a.HoldersRetired < a.HoldersSnapshotted {
			return StepRetire, ""
		}
		return StepClose, ""
	case 7: // Cancelled: the funded escrow goes back to the issuer
		return StepSweep, ""
	case 8: // VotingOpen: finalize at the deadline or on full turnout
		voted := a.VotesFor + a.VotesAgainst + a.VotesAbstain
		if now.Before(time.Unix(a.VotingEndsAt, 0)) && voted < a.UnitsSnapshotted {
			return "", "voting still open"
		}
		return StepMeetFinal, ""
	case 9: // Finalized: only an approved meeting changes the terms
		if a.Result != 1 {
			return "", "meeting not approved — nothing to apply"
		}
		return StepApplyTerms, ""
	default:
		return "", fmt.Sprintf("unknown action status %d", a.Status)
	}
}

// snapshotOrFinalize: snapshot until every outstanding unit (and, on a hooked series, every registered position) is
// in the snapshot, then finalize.
func snapshotOrFinalize(a *chain.CorporateAction, s *chain.Series, supply uint64) (string, string) {
	if supply == 0 {
		return "", "no bonds outstanding — nothing to snapshot"
	}
	if a.UnitsSnapshotted < supply || (s.Hook == 1 && a.PositionsDone+s.CkptLate < s.CkptCount) {
		return StepSnapshot, ""
	}
	return StepFinalize, ""
}

// DefaultDue is when declare_default becomes valid (plan 15 D4, program default.rs): one series day after the later
// of the payment date and the snapshot's finalization (funding only opens then). A series day is day_secs on a demo
// clock, 86 400 s otherwise.
func DefaultDue(a *chain.CorporateAction, s *chain.Series) int64 {
	grace := int64(86_400)
	if s.DaySecs > 0 {
		grace = int64(s.DaySecs)
	}
	return max(a.PaymentAt, a.RecordAt+int64(a.FinalizeDelay)) + grace
}
