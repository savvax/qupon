package sandbox

import (
	"context"
	"encoding/json"
	"errors"
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

// fixture writes a keypair file (64 numbers — the pubkey is derived from its tail) and returns its path.
func keypair(t *testing.T, dir, name string) string {
	t.Helper()
	sk := make([]int, 64)
	for i := range sk {
		sk[i] = i + int(name[0])
	}
	p := filepath.Join(dir, name+".json")
	if err := os.WriteFile(p, mustJSON(t, sk), 0o600); err != nil {
		t.Fatalf("write keypair: %v", err)
	}
	return p
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return b
}

// newService wires a Service against the fake CLI (executor/testdata/fake-cli.sh) and a temp store.
// The fake CLI replays `stdout` for every command and logs argv to the returned log path.
func newService(t *testing.T, holders []Holder) (*Service, *store.Store, string, string) {
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
	base := filepath.Join(dir, "base.json")
	exec := filepath.Join(dir, "exec.json")
	cfg := `{"series":{}}`
	if err := os.WriteFile(base, []byte(cfg), 0o644); err != nil {
		t.Fatalf("write base: %v", err)
	}
	if err := os.WriteFile(exec, []byte(cfg), 0o644); err != nil {
		t.Fatalf("write exec: %v", err)
	}
	st, err := store.Open(t.Context(), filepath.Join(dir, "sbx.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	log := filepath.Join(dir, "cli.log")
	t.Setenv("FAKE_CLI_LOG", log)
	stdout := filepath.Join(dir, "out.json")
	t.Setenv("FAKE_CLI_STDOUT", stdout)
	s := &Service{
		Exec: executor.New(bin, exec, slog.New(slog.DiscardHandler)), Store: st,
		BaseConfig: base, Log: slog.New(slog.DiscardHandler), Holders: holders,
		Now: func() time.Time { return time.Unix(1_800_000_000, 0) },
	}
	return s, st, log, stdout
}

func writeFileT(t *testing.T, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "out.json")
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatalf("write out.json: %v", err)
	}
	return p
}

var testHolders = func(dir string) []Holder {
	return []Holder{
		{Keypair: filepath.Join(dir, "h1.json"), Label: "Altyn Capital", Units: 10, Faucet: 2_000_000},
		{Keypair: filepath.Join(dir, "h2.json"), Label: "Dana K.", Units: 25, Faucet: 2_000_000},
		{Keypair: filepath.Join(dir, "h3.json"), Label: "Nomad Pension", Units: 65, Bank: true, TaxBps: 1500, Faucet: 2_000_000},
	}
}

// fakeReader plays the chain for Scenario: one series (mutable) with an optional open action.
type fakeReader struct {
	series *chain.Series
	action *chain.CorporateAction
}

func (f *fakeReader) SeriesPDA(solana.PublicKey) (solana.PublicKey, error) {
	return solana.PublicKey{9}, nil
}
func (f *fakeReader) FetchSeries(context.Context, solana.PublicKey) (*chain.Series, error) {
	return f.series, nil
}
func (f *fakeReader) FetchCorporateAction(_ context.Context, pda solana.PublicKey) (*chain.CorporateAction, error) {
	if f.series != nil && f.series.OpenAction != nil && *f.series.OpenAction == pda {
		return f.action, nil
	}
	return nil, nil
}

// TestCreate drives the whole onboarding through the fake CLI: the demo clock flag, the three custodial
// placements (10/25/65, the pension fund bank-routed at 15 % tax), the visitor wallet, the stored holders
// and the series_settings tie.
func TestCreate(t *testing.T) {
	dir := t.TempDir()
	for _, h := range testHolders(dir) {
		_ = keypair(t, dir, strings.TrimSuffix(filepath.Base(h.Keypair), ".json"))
	}
	holders := testHolders(dir)
	s, st, log, _ := newService(t, holders)
	// The fake CLI prints one canned contract for every command; the series:create output carries the mint.
	t.Setenv("FAKE_CLI_STDOUT", writeFileT(t, `{"ok":true,"signature":"sig1","slot":"7","mint":"9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM","signatures":["s1"]}`))

	created, err := s.Create(t.Context(), "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "req-1", "1.2.3.4")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if created.Ticker == "" || !strings.HasPrefix(created.Ticker, "SBX-") || len(created.Ticker) != 10 {
		t.Fatalf("ticker = %q, want SBX-<6>", created.Ticker)
	}
	raw, _ := os.ReadFile(log)
	argv := string(raw)
	for _, want := range []string{
		"--demo-day-secs 1", "--cash tkzt", "--rate-bps 1000", "--frequency 2",
		"issue --series " + created.Ticker + " --owner ", // placements
		"--units 10", "--units 25", "--units 65", "--units 5", // 10/25/65 + the wallet's 5
		"--tax-bps 1500", "payout:route --series " + created.Ticker + " --route bank", // the pension fund
		"asset:faucet", "kyc:attest",
	} {
		if !strings.Contains(argv, want) {
			t.Errorf("cli argv missing %q", want)
		}
	}
	x, err := st.SandboxByID(t.Context(), created.ID)
	if err != nil || x == nil {
		t.Fatalf("stored sandbox: %v %v", x, err)
	}
	if len(x.Holders) != 4 || x.Holders[3].Kind != "wallet" || x.Holders[2].Route != "bank" {
		t.Fatalf("holders = %+v", x.Holders)
	}
	set, err := st.GetSeriesSettings(t.Context(), x.Mint)
	if err != nil || set.SandboxID != created.ID {
		t.Fatalf("series_settings.sandbox_id = %q (err %v), want %q", set.SandboxID, err, created.ID)
	}

	// Idempotent per requestId: the same request returns the same sandbox without another CLI run.
	before := argv
	again, err := s.Create(t.Context(), "", "req-1", "1.2.3.4")
	if err != nil || again.ID != created.ID {
		t.Fatalf("idempotent create: %v %+v", err, again)
	}
	if after, _ := os.ReadFile(log); string(after) != before {
		t.Error("idempotent create ran the CLI again")
	}
}

// TestCreateRejectsBadWallet: a non-base58 wallet is a 400 bad_wallet before anything runs.
func TestCreateRejectsBadWallet(t *testing.T) {
	s, _, log, _ := newService(t, testHolders(t.TempDir()))
	_, err := s.Create(t.Context(), "not-a-wallet", "", "1.2.3.4")
	if !errors.Is(err, ErrBadWallet) {
		t.Fatalf("err = %v, want ErrBadWallet", err)
	}
	if _, err := os.Stat(log); !os.IsNotExist(err) {
		t.Error("cli ran for a bad wallet")
	}
}

// TestCreateRollsBackOnCliRefusal drives the real rollback path: the fake CLI fails `issue` (FAKE_CLI_FAIL),
// so the registry placeholder must be deleted, the executor config rewritten without the ticker and no
// sandbox row stored — a retry is not blocked by series_exists.
func TestCreateRollsBackOnCliRefusal(t *testing.T) {
	dir := t.TempDir()
	for _, h := range testHolders(dir) {
		_ = keypair(t, dir, strings.TrimSuffix(filepath.Base(h.Keypair), ".json"))
	}
	s, st, log, _ := newService(t, testHolders(dir))
	t.Setenv("FAKE_CLI_STDOUT", writeFileT(t, `{"ok":true,"signature":"sig1","slot":"7","mint":"9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"}`))
	t.Setenv("FAKE_CLI_FAIL", "issue")

	_, err := s.Create(t.Context(), "", "", "5.6.7.8")
	if !errors.Is(err, ErrExecutor) {
		t.Fatalf("err = %v, want ErrExecutor", err)
	}
	rows, err := st.ListRegistry(t.Context())
	if err != nil {
		t.Fatalf("list registry: %v", err)
	}
	for _, r := range rows {
		if strings.HasPrefix(r.Name, "SBX-") {
			t.Errorf("registry still holds %q after rollback", r.Name)
		}
	}
	cfgRaw, err := os.ReadFile(s.Exec.ConfigPath())
	if err != nil {
		t.Fatalf("read exec config: %v", err)
	}
	if lines, _ := os.ReadFile(log); strings.Contains(string(cfgRaw), tickerOf(string(lines))) && tickerOf(string(lines)) != "" {
		t.Error("executor config still names the rolled-back ticker")
	}
	if n, err := st.CountSandboxesSince(t.Context(), "", 0); err != nil || n != 0 {
		t.Fatalf("sandboxes after rollback = %d (err %v), want 0", n, err)
	}
}

// tickerOf pulls the SBX-… name out of the logged series:create argv (for the rollback assertion).
func tickerOf(cliLog string) string {
	for _, line := range strings.Split(cliLog, "\n") {
		if i := strings.Index(line, "series:create --name "); i >= 0 {
			f := strings.Fields(line[i:])
			if len(f) >= 3 {
				return f[2]
			}
		}
	}
	return ""
}

// TestThrottle: the per-IP hourly limit refuses the 4th create from one visitor while another IP proceeds;
// the daily cap counts everyone.
func TestThrottle(t *testing.T) {
	dir := t.TempDir()
	for _, h := range testHolders(dir) {
		_ = keypair(t, dir, strings.TrimSuffix(filepath.Base(h.Keypair), ".json"))
	}
	s, st, _, _ := newService(t, testHolders(dir))
	t.Setenv("FAKE_CLI_STDOUT", writeFileT(t, `{"ok":true,"signature":"s","slot":"1","mint":"9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"}`))
	for range 3 {
		if _, err := s.Create(t.Context(), "", "", "9.9.9.9"); err != nil {
			t.Fatalf("seed create: %v", err)
		}
	}
	if err := s.Allowed(t.Context(), "9.9.9.9"); !errors.Is(err, ErrThrottled) {
		t.Fatalf("4th create from one IP: err = %v, want ErrThrottled", err)
	}
	if err := s.Allowed(t.Context(), "8.8.8.8"); err != nil {
		t.Fatalf("another IP throttled by the per-IP cap: %v", err)
	}
	if n, _ := st.CountSandboxesSince(t.Context(), "", 0); n != 3 {
		t.Fatalf("daily count = %d, want 3", n)
	}
}

// TestScenarios covers all four judge scenarios; dvp_trade's money fields are asserted as Amount objects
// (the web calls BigInt(trade.accrued.minor) — a bare int64 crashes the page).
func TestScenarios(t *testing.T) {
	dir := t.TempDir()
	holders := testHolders(dir)
	for _, h := range holders {
		_ = keypair(t, dir, strings.TrimSuffix(filepath.Base(h.Keypair), ".json"))
	}
	s, st, _, _ := newService(t, holders)
	read := &fakeReader{series: &chain.Series{
		Mint: solana.PublicKey{7}, Status: 0, DaySecs: 1, IssueYmd: 20261010, IssueDate: 1_795_996_800,
	}}
	s.Read = read
	s.Outsider = keypair(t, dir, "outsider")
	t.Setenv("FAKE_CLI_STDOUT", writeFileT(t, `{"ok":true,"signature":"sig1","slot":"7","mint":"9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"}`))
	created, err := s.Create(t.Context(), "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "", "1.1.1.1")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	x, _ := st.SandboxByID(t.Context(), created.ID)

	// skip_funding flips the flag the autopilot reads (store.SetSeriesNoAutofund).
	skip, err := s.Scenario(t.Context(), created.ID, KindSkipFunding)
	if err != nil || skip.Kind != KindSkipFunding {
		t.Fatalf("skip_funding: %v %+v", err, skip)
	}
	if noFund, err := st.NoAutofundSeries(t.Context()); err != nil || !noFund[x.Mint] {
		t.Fatalf("no_autofund after skip: %v %v", noFund, err)
	}
	if _, err := s.Scenario(t.Context(), created.ID, KindSkipFunding); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("second skip_funding: err = %v, want ErrUnavailable", err)
	}

	// cure needs a default on chain; without one it is 409 scenario_unavailable.
	if _, err := s.Scenario(t.Context(), created.ID, KindCure); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("cure without default: err = %v, want ErrUnavailable", err)
	}

	// cure on a defaulted coupon funds the shortfall and clears the skip.
	read.series.InDefault = 1
	open := solana.PublicKey{5}
	read.series.OpenAction = &open
	read.action = &chain.CorporateAction{Series: open, Index: 1, Status: 10}
	cured, err := s.Scenario(t.Context(), created.ID, KindCure)
	if err != nil || len(cured.Signatures) != 1 {
		t.Fatalf("cure: %v %+v", err, cured)
	}
	if noFund, err := st.NoAutofundSeries(t.Context()); err != nil || noFund[x.Mint] {
		t.Fatalf("no_autofund after cure: %v %v", noFund, err)
	}

	// dvp_trade: clean 500000 + accrued 2083 = cash 502083, all Amount objects.
	tradeOut := `{"ok":true,"signature":"sigT","slot":"9","swapDvp":"Swap11111111111111111111111111111111111111111",
		"units":"5","clean":"500000","accrued":"2083","accruedDays":"15","cashAmount":"502083"}`
	t.Setenv("FAKE_CLI_STDOUT", writeFileT(t, tradeOut))
	dvp, err := s.Scenario(t.Context(), created.ID, KindDvpTrade)
	if err != nil {
		t.Fatalf("dvp_trade: %v", err)
	}
	if dvp.Trade == nil {
		t.Fatalf("dvp_trade without trade payload: %+v", dvp)
	}
	if got := dvp.Trade.Clean["minor"]; got != "500000" {
		t.Errorf("clean.minor = %q, want 500000", got)
	}
	if got := dvp.Trade.Accrued["minor"]; got != "2083" {
		t.Errorf("accrued.minor = %q, want 2083", got)
	}
	if got := dvp.Trade.Cash["minor"]; got != "502083" {
		t.Errorf("cash.minor = %q, want 502083", got)
	}
	if dvp.Trade.Cash["minor"] != "500000" && dvp.Trade.Cash["minor"] != "502083" {
		t.Error("cash is not clean + accrued")
	}
	if dvp.Trade.Cash["currency"] == "" {
		t.Error("currency missing")
	}
	if dvp.Trade.SettleDate == "" || dvp.Trade.Units != "5" {
		t.Errorf("settleDate/units = %q/%q", dvp.Trade.SettleDate, dvp.Trade.Units)
	}
	// The stored detail replays verbatim.
	rows, err := st.ListSandboxScenarios(t.Context(), created.ID)
	if err != nil || len(rows) != 3 {
		t.Fatalf("stored scenarios = %d (err %v), want 3", len(rows), err)
	}

	// non_kyc_transfer reports the refusal (ok:false + logs) instead of failing.
	refuse := `{"ok":false,"error":"AccountFrozen","signature":"sigR","slot":"3",
		"logs":["Program log: Error: Account is frozen"]}`
	t.Setenv("FAKE_CLI_STDOUT", writeFileT(t, refuse))
	nk, err := s.Scenario(t.Context(), created.ID, KindNonKyc)
	if err != nil {
		t.Fatalf("non_kyc_transfer: %v", err)
	}
	if nk.Error != "AccountFrozen" || len(nk.Logs) != 1 || len(nk.Signatures) != 1 {
		t.Fatalf("refusal result = %+v", nk)
	}

	// Unknown sandbox or kind.
	if _, err := s.Scenario(t.Context(), "nope", KindCure); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown sandbox: err = %v, want ErrNotFound", err)
	}
	if _, err := s.Scenario(t.Context(), created.ID, "bogus"); err == nil {
		t.Fatal("bogus kind accepted")
	}
}

// TestAmountOf keeps the Amount display format in sync with the api package (two decimals, sign kept).
func TestAmountOf(t *testing.T) {
	a := amountOf(-2083, "tKZT")
	if a["minor"] != "-2083" || a["display"] != "-20.83 tKZT" || a["currency"] != "tKZT" {
		t.Fatalf("amountOf(-2083) = %+v", a)
	}
	if b := amountOf(500000, "tKZT"); b["display"] != "5000.00 tKZT" {
		t.Fatalf("amountOf(500000) = %+v", b)
	}
}
