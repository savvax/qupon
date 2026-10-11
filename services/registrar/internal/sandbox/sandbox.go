// Package sandbox is the one-click judge sandbox (plan 15, task 1524): a visitor POSTs /demo/sandbox and gets
// a bond series of their own on a demo clock (1 s per civil day), pre-loaded with the three custodial demo
// investors of the brief (10 / 25 / 65 bonds) plus, optionally, their own wallet. The service never holds
// business logic: it drives the qupon CLI through the executor, and the autopilot walks the series to maturity.
package sandbox

import (
	"context"
	"crypto/ed25519"
	crand "crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"os"
	"strconv"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/execconfig"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

// daySecs is the sandbox demo clock: one civil day per second, so a 1-year bond (2 semi-annual coupons)
// runs its whole life — issue, coupon, default, cure, redemption — in under seven minutes.
const daySecs = "1"

// face / rate / frequency: the brief's bond (1,000 KZT face, 10 % semi-annual → 500 / 1,250 / 3,250 tKZT).
const (
	faceMinor   = 100000
	rateBps     = 1000
	frequency   = 2
	walletUnits = 5 // the visitor's own placement (the web mock's WALLET_UNITS)
)

// almaty is the zone issue dates are computed in (KZ has no DST; FixedZone avoids needing tzdata).
var almaty = time.FixedZone("Asia/Almaty", 5*60*60)

// Errors the API maps onto the web contract's codes (apps/web/src/lib/sandbox.ts).
var (
	ErrThrottled   = errors.New("demo_throttled")
	ErrBadWallet   = errors.New("bad_wallet")
	ErrNotFound    = errors.New("sandbox_not_found")
	ErrUnavailable = errors.New("scenario_unavailable")
	ErrExecutor    = errors.New("executor_failed")
)

// Limits are the create rate limits (web contract: 3 per visitor per hour, 30 per day, configurable by env).
type Limits struct {
	PerIPPerHour int
	PerDay       int
}

func (l Limits) withDefaults() Limits {
	if l.PerIPPerHour <= 0 {
		l.PerIPPerHour = 3
	}
	if l.PerDay <= 0 {
		l.PerDay = 30
	}
	return l
}

// Holder is one custodial demo investor of every sandbox — operator config (env), never state: the keypair
// signs its placement, the label is what the sandbox page shows. Defaults mirror the web mock.
type Holder struct {
	Keypair string `json:"keypair"`
	Label   string `json:"label"`
	Units   uint64 `json:"units"`
	Bank    bool   `json:"bank"`
	TaxBps  int    `json:"taxBps"`
	Faucet  uint64 `json:"faucet"` // minor units of cash minted to the holder (the DvP cash leg needs funding)
}

// DefaultHolders: the brief's placement — Altyn Capital 10, Dana K. 25, Nomad Pension 65 (bank route, 15 % tax).
func DefaultHolders() []Holder {
	base := []struct {
		label string
		units uint64
		bank  bool
		tax   int
	}{
		{"Altyn Capital", 10, false, 0},
		{"Dana K.", 25, false, 0},
		{"Nomad Pension", 65, true, 1500},
	}
	out := make([]Holder, len(base))
	for i, b := range base {
		out[i] = Holder{
			Keypair: holderKeypair(i + 1),
			Label:   b.label, Units: b.units, Bank: b.bank, TaxBps: b.tax, Faucet: 2_000_000,
		}
	}
	if custom := os.Getenv("QUPON_SANDBOX_HOLDERS"); custom != "" {
		var hs []Holder
		if err := json.Unmarshal([]byte(custom), &hs); err == nil && len(hs) > 0 {
			return hs
		}
	}
	return out
}

// Reader is the chain access the sandbox service needs; *chain.Client satisfies it.
type Reader interface {
	SeriesPDA(mint solana.PublicKey) (solana.PublicKey, error)
	FetchSeries(ctx context.Context, pda solana.PublicKey) (*chain.Series, error)
	FetchCorporateAction(ctx context.Context, pda solana.PublicKey) (*chain.CorporateAction, error)
}

// Service creates sandboxes and runs their scenarios. Safe for concurrent use (state lives in the store).
type Service struct {
	Exec       *executor.Executor
	Store      *store.Store
	Read       Reader
	BaseConfig string // config/devnet.json the executor config is regenerated from
	Log        *slog.Logger
	Limits     Limits
	Holders    []Holder // DefaultHolders() when nil
	Outsider   string   // keypair of the wallet the non-KYC transfer is refused to (QUPON_SANDBOX_OUTSIDER)
	Now        func() time.Time
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

func (s *Service) log() *slog.Logger {
	if s.Log != nil {
		return s.Log
	}
	return slog.Default()
}

func (s *Service) holders() []Holder {
	if s.Holders != nil {
		return s.Holders
	}
	return DefaultHolders()
}

// code is a random unambiguous code (no 0/O/1/I) — the ticker suffix SBX-<6> and the sandbox id.
func code(n int, alphabet string) string {
	max := big.NewInt(int64(len(alphabet)))
	out := make([]byte, n)
	for i := range out {
		c, err := crand.Int(crand.Reader, max)
		if err != nil {
			panic(err) // crypto/rand failure: the host is broken, nothing sensible to fall back to
		}
		out[i] = alphabet[c.Int64()]
	}
	return string(out)
}

// pubkeyOf reads a Solana keypair file (64-byte secret JSON) and returns its public address — the owner a
// registration refers to. The secret itself never leaves this function.
func pubkeyOf(path string) (string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read keypair %s: %w", path, err)
	}
	var sk []int // a keypair file is 64 numbers 0-255; []byte would make json expect base64 text
	if err := json.Unmarshal(raw, &sk); err != nil {
		return "", fmt.Errorf("parse keypair %s: %w", path, err)
	}
	if len(sk) != 64 {
		return "", fmt.Errorf("keypair %s: want 64 bytes, got %d", path, len(sk))
	}
	key := make([]byte, len(sk))
	for i, b := range sk {
		key[i] = byte(b)
	}
	pk, ok := ed25519.PrivateKey(key).Public().(ed25519.PublicKey)
	if !ok {
		return "", fmt.Errorf("keypair %s: not an ed25519 key", path)
	}
	return solana.PublicKeyFromBytes(pk).String(), nil
}

// pubkeyOf's keypair file is a JSON array of 64 numbers ([]byte would make json expect base64 text).

// Created is POST /demo/sandbox's success payload source (the API adds clock, schedule and links from chain).
type Created struct {
	ID     string
	Mint   string
	Ticker string
}

// Allowed enforces the create limits: PerIPPerHour for one visitor, PerDay across everyone.
func (s *Service) Allowed(ctx context.Context, ip string) error {
	lim := s.Limits.withDefaults()
	now := s.now().Unix()
	n, err := s.Store.CountSandboxesSince(ctx, ip, now-3600)
	if err != nil {
		return fmt.Errorf("count hourly sandboxes: %w", err)
	}
	if n >= lim.PerIPPerHour {
		return fmt.Errorf("%d sandboxes per visitor per hour: %w", lim.PerIPPerHour, ErrThrottled)
	}
	total, err := s.Store.CountSandboxesSince(ctx, "", now-24*3600)
	if err != nil {
		return fmt.Errorf("count daily sandboxes: %w", err)
	}
	if total >= lim.PerDay {
		return fmt.Errorf("%d sandboxes per day: %w", lim.PerDay, ErrThrottled)
	}
	return nil
}

// Create issues a sandbox: a demo-clock series (SBX-<6>), the three custodial demo investors and, when given,
// the visitor's wallet (SAS attest + register + faucet + placement), all through the qupon CLI. A CLI refusal
// rolls the registry placeholder back so a retry is never blocked by series_exists. Idempotent per requestID.
func (s *Service) Create(ctx context.Context, wallet, requestID, ip string) (*Created, error) {
	if requestID != "" {
		if x, err := s.Store.SandboxByRequest(ctx, requestID); err != nil {
			return nil, fmt.Errorf("idempotency probe: %w", err)
		} else if x != nil {
			return &Created{ID: x.ID, Mint: x.Mint, Ticker: x.Ticker}, nil
		}
	}
	if err := s.Allowed(ctx, ip); err != nil {
		return nil, err
	}
	if wallet != "" {
		if _, err := solana.PublicKeyFromBase58(wallet); err != nil {
			return nil, fmt.Errorf("%w: not a base58 Solana address", ErrBadWallet)
		}
	}

	id := code(10, "abcdefghjkmnpqrstuvwxyz23456789")
	suffix := code(6, "23456789ABCDEFGHJKMNPQRSTUVWXYZ")
	ticker := "SBX-" + suffix
	isin := "KZSBX" + suffix + "7" // KZ + 9 alphanumerics + a check digit
	now := s.now().In(almaty)
	maturity := now.AddDate(1, 0, 0)

	// Reserve the name in the registry exactly like POST /issuer/series, then run the CLI.
	terms, err := json.Marshal(map[string]any{
		"cashMint": "tKZT", "isin": isin, "faceValue": faceMinor, "couponRateBps": rateBps,
		"frequency": frequency, "dayCount": "THIRTY_360", "termYears": 1,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal terms: %w", err)
	}
	row := store.RegistryRow{Name: ticker, Mint: "", Terms: terms}
	if err := s.Store.InsertRegistry(ctx, row); err != nil {
		return nil, fmt.Errorf("reserve %s: %w", ticker, err)
	}
	res, err := s.run(ctx,
		"series:create", "--name", ticker, "--isin", isin,
		"--face", strconv.Itoa(faceMinor), "--rate-bps", strconv.Itoa(rateBps),
		"--frequency", strconv.Itoa(frequency), "--day-count", "THIRTY_360",
		"--issue-date", now.Format("2006-01-02"), "--maturity-date", maturity.Format("2006-01-02"),
		"--cash", "tkzt", "--demo-day-secs", daySecs)
	if err != nil {
		s.rollback(ctx, ticker)
		return nil, fmt.Errorf("%w: %v", ErrExecutor, err)
	}
	if !res.OK {
		s.rollback(ctx, ticker)
		return nil, fmt.Errorf("%w: %s", ErrExecutor, res.Error)
	}

	// The demo investors (and the visitor's wallet): attest, register, fund, place.
	holders := s.holders()
	labels := make([]store.SandboxHolder, 0, len(holders)+1)
	for _, h := range holders {
		if err := s.place(ctx, ticker, res.Mint, h, &labels); err != nil {
			s.rollback(ctx, ticker)
			return nil, err
		}
	}
	if wallet != "" {
		if err := s.place(ctx, ticker, res.Mint, Holder{Keypair: "", Label: "Your wallet", Units: walletUnits, Faucet: 1_000_000},
			&labels); err != nil {
			s.rollback(ctx, ticker)
			return nil, err
		}
		labels[len(labels)-1].Owner = wallet
		labels[len(labels)-1].Kind = "wallet"
	}

	x := store.Sandbox{
		ID: id, RequestID: requestID, IP: ip, Ticker: ticker, Mint: res.Mint, Wallet: wallet,
		Holders: labels, CreatedAt: s.now().Unix(), ExpiresAt: s.now().Add(24 * time.Hour).Unix(),
	}
	if err := s.Store.InsertSandbox(ctx, x); err != nil {
		return nil, fmt.Errorf("store sandbox: %w", err)
	}
	if err := s.Store.SetSeriesSandbox(ctx, res.Mint, id); err != nil {
		return nil, fmt.Errorf("tie mint to sandbox: %w", err)
	}
	if err := s.Store.UpsertRegistry(ctx, store.RegistryRow{Name: ticker, Mint: res.Mint, Terms: terms}); err != nil {
		return nil, fmt.Errorf("record mint: %w", err)
	}
	s.log().Info("sandbox created", "id", id, "ticker", ticker, "mint", res.Mint, "wallet", wallet != "")
	return &Created{ID: id, Mint: res.Mint, Ticker: ticker}, nil
}

// place runs one holder's onboarding: SAS attest (SIMULATED provider), register, cash faucet (the DvP cash
// leg and the visitor's trades need funding), bank route choice, and the placement itself.
func (s *Service) place(ctx context.Context, ticker, mint string, h Holder, labels *[]store.SandboxHolder) error {
	owner := h.Keypair
	if h.Label != "Your wallet" { // the visitor's wallet is their own address, not a server-held keypair
		pk, err := pubkeyOf(h.Keypair)
		if err != nil {
			return fmt.Errorf("holder %s: %w", h.Label, err)
		}
		owner = pk
	}
	if _, err := s.run(ctx, "kyc:attest", "--owner", owner); err != nil {
		return fmt.Errorf("%w: attest %s: %v", ErrExecutor, h.Label, err)
	}
	route := "wallet"
	if h.Bank {
		route = "bank"
	}
	tax := strconv.Itoa(h.TaxBps)
	if _, err := s.run(ctx, "investor:register", "--series", ticker, "--owner", owner,
		"--type", "legal_entity", "--residency", "resident", "--tax-bps", tax); err != nil {
		return fmt.Errorf("%w: register %s: %v", ErrExecutor, h.Label, err)
	}
	if h.Faucet > 0 {
		cash := s.cashMintOf(ctx, mint)
		if _, err := s.run(ctx, "asset:faucet", "--mint", cash, "--to", owner,
			"--amount", strconv.FormatUint(h.Faucet, 10)); err != nil {
			return fmt.Errorf("%w: faucet %s: %v", ErrExecutor, h.Label, err)
		}
	}
	if h.Bank && h.Keypair != "" {
		if _, err := s.run(ctx, "payout:route", "--series", ticker, "--route", "bank", "--keypair", h.Keypair); err != nil {
			return fmt.Errorf("%w: bank route %s: %v", ErrExecutor, h.Label, err)
		}
	}
	units := strconv.FormatUint(h.Units, 10)
	if _, err := s.run(ctx, "issue", "--series", ticker, "--owner", owner, "--units", units); err != nil {
		return fmt.Errorf("%w: place %s: %v", ErrExecutor, h.Label, err)
	}
	*labels = append(*labels, store.SandboxHolder{
		Owner: owner, Label: h.Label, Units: h.Units, Route: route, TaxRateBps: h.TaxBps, Kind: "demo",
	})
	return nil
}

// cashMintOf resolves the series' cash mint (best-effort: the CLI knows the config's testAssets too).
func (s *Service) cashMintOf(ctx context.Context, mint string) string {
	if s.Read == nil || mint == "" {
		return "tKZT"
	}
	if m, err := solana.PublicKeyFromBase58(mint); err == nil {
		if pda, err := s.Read.SeriesPDA(m); err == nil {
			if series, err := s.Read.FetchSeries(ctx, pda); err == nil && series != nil {
				return series.CashMint.String()
			}
		}
	}
	return "tKZT"
}

// rollback undoes a half-created sandbox: the registry placeholder goes away (a retry must not hit
// series_exists) and the executor config is regenerated without it.
func (s *Service) rollback(ctx context.Context, ticker string) {
	if err := s.Store.DeleteRegistry(ctx, ticker); err != nil {
		s.log().Error("sandbox rollback: delete registry row", "series", ticker, "err", err)
	}
	if err := s.rewriteConfig(ctx); err != nil {
		s.log().Error("sandbox rollback: rewrite executor config", "series", ticker, "err", err)
	}
}

func (s *Service) rewriteConfig(ctx context.Context) error {
	rows, err := s.Store.ListRegistry(ctx)
	if err != nil {
		return fmt.Errorf("list registry: %w", err)
	}
	if err := execconfig.Write(s.BaseConfig, s.Exec.ConfigPath(), rows); err != nil {
		return fmt.Errorf("write executor config: %w", err)
	}
	return nil
}

// run is one CLI step; a refused step (ok:false) is data, only a process/contract failure is an error here.
func (s *Service) run(ctx context.Context, args ...string) (executor.Result, error) {
	res, err := s.Exec.Run(ctx, args...)
	if err != nil {
		return res, fmt.Errorf("cli %s: %w", args[0], err)
	}
	if !res.OK {
		return res, fmt.Errorf("cli %s refused: %s", args[0], res.Error)
	}
	return res, nil
}

// holderKeypair is the custodial demo holder n's keypair path: QUPON_SANDBOX_INVESTOR<n>_KEYPAIR, else the devnet demo
// investor QUPON_INVESTOR<n>_KEYPAIR that the container entrypoint writes from QUPON_INVESTOR<n>_KEYPAIR_JSON — on
// production only the latter exists, and every POST /demo/sandbox failed with "read keypair : open : no such file".
func holderKeypair(n int) string {
	if p := os.Getenv("QUPON_SANDBOX_INVESTOR" + strconv.Itoa(n) + "_KEYPAIR"); p != "" {
		return p
	}
	return os.Getenv("QUPON_INVESTOR" + strconv.Itoa(n) + "_KEYPAIR")
}
