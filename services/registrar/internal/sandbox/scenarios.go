package sandbox

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// Scenario kinds (the web contract's ScenarioKind, apps/web/src/lib/sandbox.ts).
const (
	KindSkipFunding = "skip_funding"
	KindCure        = "cure"
	KindNonKyc      = "non_kyc_transfer"
	KindDvpTrade    = "dvp_trade"
)

// tradeUnits is the dvp_trade size: 5 bonds at clean 100 % + accrued (the web mock's tradeLeg).
const tradeUnits = "5"

// Amount is the web contract's money object {minor, display, currency}; amountOf keeps the same display
// format as the api package's money.amount (minor/100, two decimals) so the two stay in sync.
func amountOf(minor int64, currency string) map[string]string {
	sign, abs := "", minor
	if abs < 0 {
		sign, abs = "-", -abs
	}
	return map[string]string{
		"minor":    strconv.FormatInt(minor, 10), // signed, like Amount.minor everywhere else
		"display":  fmt.Sprintf("%s%d.%02d %s", sign, abs/100, abs%100, currency),
		"currency": currency,
	}
}

// TradeAccrued is the program's TradeAccrued event of a settled dvp_trade: clean + accrued = the cash leg
// (accrued is negative in the ex-coupon window).
type TradeAccrued struct {
	Units       string            `json:"units"`
	Seller      string            `json:"seller"`
	Buyer       string            `json:"buyer"`
	Clean       map[string]string `json:"clean"`
	Accrued     map[string]string `json:"accrued"`
	Cash        map[string]string `json:"cash"`
	AccruedDays int64             `json:"accruedDays"`
	SettleDate  string            `json:"settleDate"` // civil settlement date on the bond's calendar
}

// ScenarioResult is POST /demo/sandbox/{id}/scenario's payload, stored verbatim and replayed in
// GET /demo/sandbox/{id}.scenarios[] (newest first).
type ScenarioResult struct {
	Kind       string        `json:"kind"`
	At         int64         `json:"at"` // unix ms
	Signatures []string      `json:"signatures"`
	Error      string        `json:"error,omitempty"`
	Logs       []string      `json:"logs,omitempty"`
	Trade      *TradeAccrued `json:"trade,omitempty"`
}

// Scenario runs one judge scenario against a sandbox. The state checks stay on-chain where they matter
// (a cure funds a real shortfall; a refusal is a real failed transaction); the service only sequences CLI steps.
func (s *Service) Scenario(ctx context.Context, id, kind string) (*ScenarioResult, error) {
	x, err := s.Store.SandboxByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("load sandbox: %w", err)
	}
	if x == nil {
		return nil, ErrNotFound
	}
	series, open, err := s.seriesOf(ctx, x.Mint)
	if err != nil {
		return nil, err
	}
	if series == nil {
		return nil, fmt.Errorf("%w: the series left the chain", ErrUnavailable)
	}

	var out *ScenarioResult
	switch kind {
	case KindSkipFunding:
		out, err = s.skipFunding(ctx, x, series)
	case KindCure:
		out, err = s.cure(ctx, x, series, open)
	case KindNonKyc:
		out, err = s.nonKycTransfer(ctx, x)
	case KindDvpTrade:
		out, err = s.dvpTrade(ctx, x, series)
	default:
		return nil, fmt.Errorf("bad_kind: unknown scenario %q", kind)
	}
	if err != nil {
		return nil, err
	}
	out.Signatures = sigs(out.Signatures)
	detail, err := json.Marshal(out)
	if err != nil {
		return nil, fmt.Errorf("marshal scenario: %w", err)
	}
	if err := s.Store.InsertSandboxScenario(ctx, id, kind, out.At/1000, detail); err != nil {
		return nil, fmt.Errorf("store scenario: %w", err)
	}
	s.log().Info("sandbox scenario", "id", id, "kind", kind)
	return out, nil
}

// seriesOf loads the sandbox's Series and its open action (nil when none is open).
func (s *Service) seriesOf(ctx context.Context, mint string) (*chain.Series, *chain.CorporateAction, error) {
	if s.Read == nil {
		return nil, nil, nil
	}
	m, err := solana.PublicKeyFromBase58(mint)
	if err != nil {
		return nil, nil, fmt.Errorf("sandbox mint %s: %w", mint, err)
	}
	pda, err := s.Read.SeriesPDA(m)
	if err != nil {
		return nil, nil, fmt.Errorf("series pda of %s: %w", mint, err)
	}
	series, err := s.Read.FetchSeries(ctx, pda)
	if err != nil {
		return nil, nil, fmt.Errorf("fetch series %s: %w", mint, err)
	}
	if series == nil || series.OpenAction == nil {
		return series, nil, nil
	}
	open, err := s.Read.FetchCorporateAction(ctx, *series.OpenAction)
	if err != nil {
		return nil, nil, fmt.Errorf("fetch open action of %s: %w", mint, err)
	}
	return series, open, nil
}

func sigs(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

// skipFunding flips the no_autofund flag (task 1522): the autopilot stops funding, the coupon's payment date
// passes unfunded and the autopilot declares the default after executor.DefaultDue — the cure scenario undoes it.
func (s *Service) skipFunding(ctx context.Context, x *store.Sandbox, series *chain.Series) (*ScenarioResult, error) {
	if series.Status == 3 {
		return nil, fmt.Errorf("%w: the series is redeemed and closed", ErrUnavailable)
	}
	if x.SkipFunding {
		return nil, fmt.Errorf("%w: funding is already skipped", ErrUnavailable)
	}
	if err := s.Store.SetSeriesNoAutofund(ctx, x.Mint, true); err != nil {
		return nil, fmt.Errorf("set no_autofund: %w", err)
	}
	if err := s.Store.SetSandboxSkip(ctx, x.ID, true); err != nil {
		return nil, fmt.Errorf("mark sandbox skipped: %w", err)
	}
	return &ScenarioResult{Kind: KindSkipFunding, At: s.now().UnixMilli(), Signatures: []string{}}, nil
}

// cure funds the defaulted action's real shortfall (the CLI computes it) and clears the skip flag, so the
// autopilot resumes funding the next coupon.
func (s *Service) cure(ctx context.Context, x *store.Sandbox, series *chain.Series, open *chain.CorporateAction) (*ScenarioResult, error) {
	if series.InDefault != 1 || open == nil {
		return nil, fmt.Errorf("%w: nothing to cure: no coupon is in default", ErrUnavailable)
	}
	res, err := s.run(ctx, "action:fund", "--series", x.Ticker, "--index", strconv.FormatUint(uint64(open.Index), 10))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrExecutor, err)
	}
	if err := s.Store.SetSeriesNoAutofund(ctx, x.Mint, false); err != nil {
		return nil, fmt.Errorf("clear no_autofund: %w", err)
	}
	if err := s.Store.SetSandboxSkip(ctx, x.ID, false); err != nil {
		return nil, fmt.Errorf("unmark sandbox skipped: %w", err)
	}
	return &ScenarioResult{
		Kind: KindCure, At: s.now().UnixMilli(),
		Signatures: sigs([]string{res.Signature}),
	}, nil
}

// nonKycTransfer attempts a bond transfer to a wallet with no investor record and reports the on-chain
// refusal: the CLI sends with skipPreflight, so the failed transaction still has a signature and logs.
func (s *Service) nonKycTransfer(ctx context.Context, x *store.Sandbox) (*ScenarioResult, error) {
	if s.Outsider == "" {
		return nil, fmt.Errorf("%w: no outsider wallet configured (QUPON_SANDBOX_OUTSIDER)", ErrUnavailable)
	}
	holders := s.holders()
	if len(holders) == 0 || holders[0].Keypair == "" {
		return nil, fmt.Errorf("%w: no custodial demo investor configured", ErrUnavailable)
	}
	res, err := s.Exec.Run(ctx, "sandbox:refuse", "--series", x.Ticker,
		"--keypair", holders[0].Keypair, "--to", s.outsiderOwner(), "--units", "1")
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrExecutor, err)
	}
	if res.OK {
		return nil, fmt.Errorf("%w: the transfer unexpectedly succeeded", ErrUnavailable)
	}
	return &ScenarioResult{
		Kind: KindNonKyc, At: s.now().UnixMilli(),
		Signatures: sigs([]string{res.Signature}),
		Error:      res.Error,
		Logs:       res.Logs,
	}, nil
}

// outsiderOwner caches the outsider wallet's address (its keypair file's public key).
func (s *Service) outsiderOwner() string {
	if pk, err := pubkeyOf(s.Outsider); err == nil {
		return pk
	}
	return s.Outsider // an address was configured directly
}

// dvpTrade creates, admits, funds and settles a 5-bond trade between the two custodial demo investors at
// clean 100 % + accrued, and reports the program's TradeAccrued economics.
func (s *Service) dvpTrade(ctx context.Context, x *store.Sandbox, series *chain.Series) (*ScenarioResult, error) {
	if series.Status == 3 {
		return nil, fmt.Errorf("%w: the series is redeemed and closed", ErrUnavailable)
	}
	holders := s.holders()
	if len(holders) < 2 || holders[0].Keypair == "" || holders[1].Keypair == "" {
		return nil, fmt.Errorf("%w: two custodial demo investors are needed for a trade", ErrUnavailable)
	}
	seller, err := pubkeyOf(holders[1].Keypair)
	if err != nil {
		return nil, fmt.Errorf("%w: seller keypair: %v", ErrExecutor, err)
	}
	buyer, err := pubkeyOf(holders[0].Keypair)
	if err != nil {
		return nil, fmt.Errorf("%w: buyer keypair: %v", ErrExecutor, err)
	}

	create, err := s.run(ctx, "trade:create", "--series", x.Ticker,
		"--seller", seller, "--buyer", buyer, "--units", tradeUnits)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrExecutor, err)
	}
	sigsRun := []string{create.Signature}
	for _, leg := range []struct{ side, keypair string }{
		{"bond", holders[1].Keypair}, // the seller escrows the bonds…
		{"cash", holders[0].Keypair}, // …the buyer pays the dirty price
	} {
		res, err := s.run(ctx, "trade:fund", "--series", x.Ticker, "--trade", create.SwapDvp,
			"--side", leg.side, "--keypair", leg.keypair)
		if err != nil {
			return nil, fmt.Errorf("%w: fund %s leg: %v", ErrExecutor, leg.side, err)
		}
		sigsRun = append(sigsRun, res.Signature)
	}
	settle, err := s.run(ctx, "trade:settle", "--series", x.Ticker, "--trade", create.SwapDvp)
	if err != nil {
		return nil, fmt.Errorf("%w: settle: %v", ErrExecutor, err)
	}
	sigsRun = append(sigsRun, settle.Signature)

	cur := chain.CashCurrency(series.CashMint)
	trade := &TradeAccrued{
		Units:       strconv.FormatUint(uint64(create.Units), 10),
		Seller:      seller,
		Buyer:       buyer,
		Clean:       amountOf(int64(create.Clean), cur),
		Accrued:     amountOf(int64(create.Accrued), cur),
		Cash:        amountOf(int64(create.CashAmount), cur),
		AccruedDays: int64(create.AccruedDays),
		SettleDate:  settleDate(series, s.now()),
	}
	return &ScenarioResult{Kind: KindDvpTrade, At: s.now().UnixMilli(), Signatures: sigs(sigsRun), Trade: trade}, nil
}

// settleDate is the trade's civil settlement date on the bond's own calendar: issue date + as many bond days
// as the demo clock has run since issue (a 1 s day makes this drift fast on purpose).
func settleDate(series *chain.Series, now time.Time) string {
	daySecs := int64(series.DaySecs)
	if daySecs <= 0 {
		daySecs = 86_400
	}
	day := (now.Unix() - series.IssueDate) / daySecs
	if day < 0 {
		day = 0
	}
	if series.IssueYmd == 0 {
		return now.UTC().Format("2006-01-02")
	}
	issue := time.Date(int(series.IssueYmd/10_000), time.Month(series.IssueYmd/100%100), int(series.IssueYmd%100), 0, 0, 0, 0, time.UTC)
	return issue.AddDate(0, 0, int(day)).Format("2006-01-02")
}
