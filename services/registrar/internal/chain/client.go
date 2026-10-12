// RPC client for qupon_bonds and Token-2022 accounts: getAccountInfo /
// getProgramAccounts with timeout, retry and discriminator+memcmp filters.
// Never filter by dataSize (docs/04-stack.md: account sizes vary with TLV).
package chain

import (
	"bytes"
	"cmp"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"os"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/qupon-kz/qupon/services/registrar/internal/borsh"
	solana "github.com/solana-foundation/solana-go/v2"
	"github.com/solana-foundation/solana-go/v2/rpc"
	"github.com/solana-foundation/solana-go/v2/rpc/jsonrpc"
)

const (
	rpcTimeout         = 30 * time.Second
	rpcAttempts        = 3
	retryBaseWait      = 250 * time.Millisecond
	rateLimitAttempts  = 4                      // HTTP 429 gets one more try — the shared devnet key is rate-limited (task 91583)
	rateLimitBaseWait  = 500 * time.Millisecond // 429 backoff base: 0.5 s, 1 s, 2 s with jitter
	defaultGPACacheTTL = 3 * time.Second
	defaultCommitm_    = rpc.CommitmentConfirmed // Alpenglow: confirmed ≈ finalized
)

// Client reads on-chain accounts over JSON-RPC. Safe for concurrent use.
type Client struct {
	rpc     *rpc.Client
	program solana.PublicKey
	log     *slog.Logger
	cache   gpaCache
	pre     prefetchCache
	// rateLimitBase is the HTTP-429 backoff base; a field only so tests shrink it.
	rateLimitBase time.Duration
	// cool is the client-wide 429 gate (task 91585): every RPC attempt of every
	// caller waits for it, so scheduler, ingest-driven reads and API handlers
	// stop hammering the IP together once devnet rate-limits one of them.
	cool coolDown
}

// gpaCache memoizes getProgramAccount scans (task 91583): both registrar boxes
// share one rate-limited devnet RPC key, and every scheduler tick plus many API
// reads re-scan the same accounts. Key = discriminator + memcmp filters.
type gpaCache struct {
	mu      sync.Mutex
	ttl     time.Duration // RPC_GPA_CACHE_TTL; 0 disables caching
	entries map[string]gpaEntry
	flying  map[string]*gpaFlight // singleflight: identical concurrent scans share one RPC request
	gen     uint64                // bumped on invalidation: scans started before it are stale
	now     func() time.Time      // injectable clock (tests)
}

type gpaEntry struct {
	recs []AccountRecord
	at   time.Time
}

// gpaFlight is one in-progress scan; concurrent callers wait on done.
type gpaFlight struct {
	done chan struct{}
	recs []AccountRecord
	err  error
}

// prefetchCache holds the accounts the last Prefetch read in one getMultipleAccounts; GetAccount serves them
// for prefetchTTL. The scheduler prefetches every open action and bond mint once per tick: two getAccountInfo
// per series every 2 s spent the keyed RPC's whole quota (2026-10-12).
type prefetchCache struct {
	mu   sync.Mutex
	at   time.Time
	data map[solana.PublicKey][]byte // nil value = account absent
}

const prefetchTTL = 2 * time.Second

// coolDown is the shared "no RPC until" timestamp set by any rate-limited
// error. Zero value is ready to use.
type coolDown struct {
	mu    sync.Mutex
	until time.Time
}

// push moves the gate to now+wait, never earlier; returns the gate it set and
// whether a fresh episode started (the client was idle) so the caller logs once
// per episode, not once per call.
func (cd *coolDown) push(wait time.Duration) (time.Time, bool) {
	until := time.Now().Add(wait)
	cd.mu.Lock()
	defer cd.mu.Unlock()
	if !until.After(cd.until) {
		return cd.until, false
	}
	fresh := !time.Now().Before(cd.until) // was idle → new episode
	cd.until = until
	return until, fresh
}

// wait blocks until the gate opens or ctx is done.
func (cd *coolDown) wait(ctx context.Context) error {
	for {
		cd.mu.Lock()
		d := time.Until(cd.until)
		cd.mu.Unlock()
		if d <= 0 {
			return nil
		}
		t := time.NewTimer(d)
		select {
		case <-ctx.Done():
			t.Stop()
			return ctx.Err()
		case <-t.C:
		}
	}
}

// Prefetch reads keys with getMultipleAccounts for the GetAccount calls that follow.
func (c *Client) Prefetch(ctx context.Context, keys []solana.PublicKey) error {
	accs, err := c.getMultiple(ctx, keys)
	if err != nil {
		return fmt.Errorf("prefetch: %w", err)
	}
	data := make(map[solana.PublicKey][]byte, len(keys))
	for i, acc := range accs {
		data[keys[i]] = nil
		if acc != nil {
			data[keys[i]] = acc.Data.GetBinary()
		}
	}
	c.pre.mu.Lock()
	c.pre.data, c.pre.at = data, time.Now()
	c.pre.mu.Unlock()
	return nil
}

// SeriesByMints reads the Series accounts of mints with getMultipleAccounts; mints without one are skipped.
// The scheduler reads the series it drives this way instead of scanning every Series each tick — public
// devnet rate-limits getProgramAccounts hardest ("Too many requests for a specific RPC call", 2026-10-12).
func (c *Client) SeriesByMints(ctx context.Context, mints []solana.PublicKey) ([]SeriesRecord, error) {
	pdas := make([]solana.PublicKey, len(mints))
	for i, m := range mints {
		pda, err := SeriesPDA(c.program, m)
		if err != nil {
			return nil, err
		}
		pdas[i] = pda
	}
	accs, err := c.getMultiple(ctx, pdas)
	if err != nil {
		return nil, fmt.Errorf("read series: %w", err)
	}
	out := make([]SeriesRecord, 0, len(accs))
	for i, acc := range accs {
		if acc == nil {
			continue
		}
		body, err := stripDiscriminator(acc.Data.GetBinary(), "Series")
		if err != nil {
			return nil, fmt.Errorf("read series %s: %w", pdas[i], err)
		}
		s, err := DecodeSeries(body)
		if err != nil {
			return nil, fmt.Errorf("read series %s: %w", pdas[i], err)
		}
		out = append(out, SeriesRecord{PDA: pdas[i], Series: s})
	}
	return out, nil
}

// getMultiple is getMultipleAccounts in chunks of 100 (the RPC maximum); a nil entry = account absent.
func (c *Client) getMultiple(ctx context.Context, keys []solana.PublicKey) ([]*rpc.Account, error) {
	out := make([]*rpc.Account, 0, len(keys))
	for chunk := range slices.Chunk(keys, 100) {
		var res *rpc.GetMultipleAccountsResult
		err := c.withRetry(ctx, func() (err error) {
			res, err = c.rpc.GetMultipleAccountsWithOpts(ctx, chunk, &rpc.GetMultipleAccountsOpts{Commitment: defaultCommitm_})
			return err
		})
		if err != nil {
			return nil, err
		}
		if len(res.Value) != len(chunk) {
			return nil, fmt.Errorf("%d accounts answered for %d keys", len(res.Value), len(chunk))
		}
		out = append(out, res.Value...)
	}
	return out, nil
}

func (c *Client) prefetched(key solana.PublicKey) ([]byte, bool) {
	c.pre.mu.Lock()
	defer c.pre.mu.Unlock()
	if time.Since(c.pre.at) > prefetchTTL {
		return nil, false
	}
	d, ok := c.pre.data[key]
	return d, ok
}

// NewClient builds a chain reader for rpcURL (devnet endpoint) and program.
// Program-account scans are cached for RPC_GPA_CACHE_TTL (default 3 s, "0"
// disables) — every CLI step invalidates the cache (task 91583).
func NewClient(rpcURL string, program solana.PublicKey, log *slog.Logger) *Client {
	ttl := defaultGPACacheTTL
	if v := os.Getenv("RPC_GPA_CACHE_TTL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			log.Warn("invalid RPC_GPA_CACHE_TTL, using default", "err", err)
		} else {
			ttl = d
		}
	}
	return &Client{
		rpc:           NewRPC(rpcURL, rpcTimeout), // every call passes Commitment: defaultCommitm_ explicitly
		program:       program,
		log:           log,
		cache:         gpaCache{ttl: ttl, entries: map[string]gpaEntry{}, flying: map[string]*gpaFlight{}, now: time.Now},
		rateLimitBase: rateLimitBaseWait,
	}
}

// AccountDiscriminator returns sha256("account:<Name>")[:8] (Anchor scheme)
// for Series, Investor, CorporateAction, Entitlement, TradeAdmission.
func AccountDiscriminator(name string) ([8]byte, error) {
	return borsh.AnchorDiscriminator("account", name)
}

// AccountRecord is one row of a program-account scan; Data is the full
// account data including the 8-byte discriminator.
type AccountRecord struct {
	Pubkey solana.PublicKey
	Data   []byte
}

// GetAccount returns the raw account data (discriminator included);
// a missing account yields (nil, nil).
func (c *Client) GetAccount(ctx context.Context, key solana.PublicKey) ([]byte, error) {
	return c.GetAccountAt(ctx, key, 0)
}

// GetAccountAt is GetAccount with minContextSlot: the RPC node answers from
// a bank at or past minSlot (0 = unset), never an older one. This is not a
// historical query — snapshot balances are read as current balances while the
// mint is paused (docs/03-domain.md §4).
func (c *Client) GetAccountAt(ctx context.Context, key solana.PublicKey, minSlot uint64) ([]byte, error) {
	if d, ok := c.prefetched(key); ok && minSlot == 0 {
		return d, nil
	}
	var out []byte
	err := c.withRetry(ctx, func() error {
		opts := &rpc.GetAccountInfoOpts{Commitment: defaultCommitm_}
		if minSlot > 0 {
			opts.MinContextSlot = &minSlot
		}
		res, err := c.rpc.GetAccountInfoWithOpts(ctx, key, opts)
		if err != nil {
			return err
		}
		out = res.Value.Data.GetBinary()
		return nil
	})
	if errors.Is(err, rpc.ErrNotFound) {
		return nil, nil
	}
	return out, err
}

// AccountData is raw account data together with its owner program.
type AccountData struct {
	Data  []byte
	Owner solana.PublicKey
}

// GetAccountWithOwner is GetAccount plus the owning program (nil if absent).
// The cash-asset registry (platform v2 §5.1) needs the owner to tell a Token
// mint from a Token-2022 mint from an account owned by another program.
func (c *Client) GetAccountWithOwner(ctx context.Context, key solana.PublicKey) (*AccountData, error) {
	var out *AccountData
	err := c.withRetry(ctx, func() error {
		res, err := c.rpc.GetAccountInfoWithOpts(ctx, key, &rpc.GetAccountInfoOpts{Commitment: defaultCommitm_})
		if err != nil {
			return err
		}
		out = &AccountData{Data: res.Value.Data.GetBinary(), Owner: res.Value.Owner}
		return nil
	})
	if errors.Is(err, rpc.ErrNotFound) {
		return nil, nil
	}
	return out, err
}

// GetProgramAccounts scans program accounts by Anchor discriminator plus
// optional memcmp filters (ANDed). Discriminator filter sits at offset 0.
// Results are cached for the cache TTL and returned as copies; concurrent
// identical scans share one RPC request (task 91583).
func (c *Client) GetProgramAccounts(
	ctx context.Context,
	disc [8]byte,
	memcmp []rpc.RPCFilterMemcmp,
) ([]AccountRecord, error) {
	if c.cache.ttl <= 0 {
		return c.scanProgramAccounts(ctx, disc, memcmp)
	}
	key := gpaKey(disc, memcmp)
	c.cache.mu.Lock()
	if e, ok := c.cache.entries[key]; ok && c.cache.now().Sub(e.at) < c.cache.ttl {
		c.cache.mu.Unlock()
		return cloneRecords(e.recs), nil
	}
	if fl, ok := c.cache.flying[key]; ok { // an identical scan is already in flight — wait for it
		c.cache.mu.Unlock()
		select {
		case <-fl.done:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		return cloneRecords(fl.recs), fl.err
	}
	fl := &gpaFlight{done: make(chan struct{})}
	c.cache.flying[key] = fl
	gen := c.cache.gen // survives invalidations only if none happens during the scan
	c.cache.mu.Unlock()

	recs, err := c.scanProgramAccounts(ctx, disc, memcmp)

	c.cache.mu.Lock()
	fl.recs, fl.err = recs, err
	if err == nil && c.cache.gen == gen { // a step finished meanwhile → don't cache stale rows
		c.cache.entries[key] = gpaEntry{recs: recs, at: c.cache.now()}
	}
	if c.cache.flying[key] == fl { // invalidation cleared the map; a fresh flight may own the key
		delete(c.cache.flying, key)
	}
	c.cache.mu.Unlock()
	close(fl.done)
	return cloneRecords(recs), err
}

// InvalidateProgramAccounts drops every cached scan: any CLI step may have
// changed chain state (wired to the executor completion hook, task 91583).
func (c *Client) InvalidateProgramAccounts() {
	c.cache.mu.Lock()
	c.cache.gen++ // retire scans in flight: they must not repopulate the cache
	clear(c.cache.entries)
	clear(c.cache.flying) // new callers start a fresh scan instead of joining a stale flight
	c.cache.mu.Unlock()
	c.pre.mu.Lock()
	c.pre.data = nil
	c.pre.mu.Unlock()
}

func gpaKey(disc [8]byte, memcmp []rpc.RPCFilterMemcmp) string {
	var b strings.Builder
	fmt.Fprintf(&b, "%x", disc)
	for _, m := range memcmp {
		fmt.Fprintf(&b, "|%d:%s", m.Offset, m.Bytes)
	}
	return b.String()
}

func cloneRecords(recs []AccountRecord) []AccountRecord {
	out := make([]AccountRecord, len(recs))
	for i, r := range recs {
		out[i] = AccountRecord{Pubkey: r.Pubkey, Data: bytes.Clone(r.Data)}
	}
	return out
}

// scanProgramAccounts is the uncached RPC scan behind GetProgramAccounts.
func (c *Client) scanProgramAccounts(
	ctx context.Context,
	disc [8]byte,
	memcmp []rpc.RPCFilterMemcmp,
) ([]AccountRecord, error) {
	filters := make([]rpc.RPCFilter, 0, len(memcmp)+1)
	filters = append(filters, rpc.RPCFilter{
		Memcmp: &rpc.RPCFilterMemcmp{Offset: 0, Bytes: solana.Base58(disc[:])},
	})
	for _, m := range memcmp {
		filters = append(filters, rpc.RPCFilter{
			Memcmp: &rpc.RPCFilterMemcmp{Offset: m.Offset, Bytes: m.Bytes},
		})
	}
	var out []AccountRecord
	err := c.withRetry(ctx, func() error {
		res, err := c.rpc.GetProgramAccountsWithOpts(ctx, c.program, &rpc.GetProgramAccountsOpts{
			Filters:    filters,
			Commitment: defaultCommitm_,
		})
		if err != nil {
			return err
		}
		out = make([]AccountRecord, 0, len(res))
		for _, ka := range res {
			out = append(out, AccountRecord{Pubkey: ka.Pubkey, Data: ka.Account.Data.GetBinary()})
		}
		return nil
	})
	return out, err
}

// SeriesRecord pairs a Series account with its PDA.
type SeriesRecord struct {
	PDA    solana.PublicKey
	Series *Series
}

// FetchSeries decodes the Series account at pda; nil if the account is absent.
func (c *Client) FetchSeries(ctx context.Context, pda solana.PublicKey) (*Series, error) {
	data, err := c.GetAccount(ctx, pda)
	if err != nil {
		return nil, fmt.Errorf("fetch series %s: %w", pda, err)
	}
	if data == nil {
		return nil, nil
	}
	body, err := stripDiscriminator(data, "Series")
	if err != nil {
		return nil, fmt.Errorf("fetch series %s: %w", pda, err)
	}
	return DecodeSeries(body)
}

// FetchCorporateAction decodes the CorporateAction at pda; nil if absent.
func (c *Client) FetchCorporateAction(ctx context.Context, pda solana.PublicKey) (*CorporateAction, error) {
	data, err := c.GetAccount(ctx, pda)
	if err != nil {
		return nil, fmt.Errorf("fetch action %s: %w", pda, err)
	}
	if data == nil {
		return nil, nil
	}
	body, err := stripDiscriminator(data, "CorporateAction")
	if err != nil {
		return nil, fmt.Errorf("fetch action %s: %w", pda, err)
	}
	return DecodeCorporateAction(body)
}

// FetchInvestorsBySeries lists a series' Investor accounts sorted by owner
// pubkey ascending (bytes) — the snapshot order (docs/03-domain.md §4).
// memcmp: bump u8 then series pubkey → body offset 1 = absolute offset 9.
func (c *Client) FetchInvestorsBySeries(ctx context.Context, series solana.PublicKey) ([]InvestorRecord, error) {
	recs, err := c.GetProgramAccounts(ctx, mustDiscriminator("Investor"),
		[]rpc.RPCFilterMemcmp{{Offset: 9, Bytes: solana.Base58(series[:])}})
	if err != nil {
		return nil, fmt.Errorf("scan investors of %s: %w", series, err)
	}
	out := make([]InvestorRecord, 0, len(recs))
	for _, rec := range recs {
		body, err := stripDiscriminator(rec.Data, "Investor")
		if err != nil {
			return nil, fmt.Errorf("scan investors %s: %w", rec.Pubkey, err)
		}
		inv, err := DecodeInvestor(body)
		if err != nil {
			return nil, fmt.Errorf("scan investors %s: %w", rec.Pubkey, err)
		}
		out = append(out, InvestorRecord{PDA: rec.Pubkey, Investor: inv})
	}
	sortByInvestorOwner(out)
	return out, nil
}

// FetchTradeAdmissionsBySeries lists a series' TradeAdmission accounts (admitted Solana DvP trades not yet
// released), oldest first. memcmp offset 9 = discriminator + bump, then the series pubkey.
func (c *Client) FetchTradeAdmissionsBySeries(ctx context.Context, series solana.PublicKey) ([]TradeRecord, error) {
	recs, err := c.GetProgramAccounts(ctx, mustDiscriminator("TradeAdmission"),
		[]rpc.RPCFilterMemcmp{{Offset: 9, Bytes: solana.Base58(series[:])}})
	if err != nil {
		return nil, fmt.Errorf("scan trades of %s: %w", series, err)
	}
	out := make([]TradeRecord, 0, len(recs))
	for _, rec := range recs {
		body, err := stripDiscriminator(rec.Data, "TradeAdmission")
		if err != nil {
			return nil, fmt.Errorf("scan trades %s: %w", rec.Pubkey, err)
		}
		t, err := DecodeTradeAdmission(body)
		if err != nil {
			return nil, fmt.Errorf("scan trades %s: %w", rec.Pubkey, err)
		}
		out = append(out, TradeRecord{PDA: rec.Pubkey, Trade: t})
	}
	slices.SortFunc(out, func(a, b TradeRecord) int {
		return cmp.Or(cmp.Compare(a.Trade.AdmittedAt, b.Trade.AdmittedAt), strings.Compare(a.Trade.SwapDvp.String(), b.Trade.SwapDvp.String()))
	})
	return out, nil
}

// FetchEntitlementsByAction lists an action's Entitlement accounts sorted by
// owner pubkey ascending (bytes). memcmp offset 9 = bump u8 + action pubkey.
func (c *Client) FetchEntitlementsByAction(ctx context.Context, action solana.PublicKey) ([]EntitlementRecord, error) {
	recs, err := c.GetProgramAccounts(ctx, mustDiscriminator("Entitlement"),
		[]rpc.RPCFilterMemcmp{{Offset: 9, Bytes: solana.Base58(action[:])}})
	if err != nil {
		return nil, fmt.Errorf("scan entitlements of %s: %w", action, err)
	}
	out := make([]EntitlementRecord, 0, len(recs))
	for _, rec := range recs {
		body, err := stripDiscriminator(rec.Data, "Entitlement")
		if err != nil {
			return nil, fmt.Errorf("scan entitlements %s: %w", rec.Pubkey, err)
		}
		e, err := DecodeEntitlement(body)
		if err != nil {
			return nil, fmt.Errorf("scan entitlements %s: %w", rec.Pubkey, err)
		}
		out = append(out, EntitlementRecord{PDA: rec.Pubkey, Entitlement: e})
	}
	sortByEntitlementOwner(out)
	return out, nil
}

func sortByEntitlementOwner(recs []EntitlementRecord) {
	slices.SortFunc(recs, func(a, b EntitlementRecord) int {
		return bytes.Compare(a.Entitlement.Owner[:], b.Entitlement.Owner[:])
	})
}

func sortByInvestorOwner(recs []InvestorRecord) {
	slices.SortFunc(recs, func(a, b InvestorRecord) int {
		return bytes.Compare(a.Investor.Owner[:], b.Investor.Owner[:])
	})
}

func mustDiscriminator(name string) [8]byte {
	disc, err := AccountDiscriminator(name)
	if err != nil {
		panic(err) // sha256 of a fixed name cannot fail
	}
	return disc
}

// AllSeries scans the program for every Series account (startup index pass).
func (c *Client) AllSeries(ctx context.Context) ([]SeriesRecord, error) {
	disc, err := AccountDiscriminator("Series")
	if err != nil {
		return nil, err
	}
	recs, err := c.GetProgramAccounts(ctx, disc, nil)
	if err != nil {
		return nil, fmt.Errorf("scan series: %w", err)
	}
	out := make([]SeriesRecord, 0, len(recs))
	for _, rec := range recs {
		body, err := stripDiscriminator(rec.Data, "Series")
		if err != nil {
			return nil, fmt.Errorf("scan series %s: %w", rec.Pubkey, err)
		}
		s, err := DecodeSeries(body)
		if err != nil {
			return nil, fmt.Errorf("scan series %s: %w", rec.Pubkey, err)
		}
		out = append(out, SeriesRecord{PDA: rec.Pubkey, Series: s})
	}
	return out, nil
}

// FetchEntitlement decodes the Entitlement at pda; nil if the account is absent.
func (c *Client) FetchEntitlement(ctx context.Context, pda solana.PublicKey) (*Entitlement, error) {
	data, err := c.GetAccount(ctx, pda)
	if err != nil {
		return nil, fmt.Errorf("fetch entitlement %s: %w", pda, err)
	}
	if data == nil {
		return nil, nil
	}
	body, err := stripDiscriminator(data, "Entitlement")
	if err != nil {
		return nil, fmt.Errorf("fetch entitlement %s: %w", pda, err)
	}
	return DecodeEntitlement(body)
}

// ProgramID returns the program the client reads from.
func (c *Client) ProgramID() solana.PublicKey { return c.program }

// stripDiscriminator verifies and removes the 8-byte Anchor discriminator.
func stripDiscriminator(data []byte, name string) ([]byte, error) {
	disc, err := AccountDiscriminator(name)
	if err != nil {
		return nil, err
	}
	if len(data) < 8 || !bytes.Equal(data[:8], disc[:]) {
		return nil, fmt.Errorf("%s: discriminator mismatch", name)
	}
	return data[8:], nil
}

// withRetry re-runs call on transport/RPC errors. Not-found and context
// errors are not retried. HTTP 429 (the shared devnet key is rate-limited)
// backs off exponentially with jitter and gets one extra attempt; other errors
// keep the quick linear retry (task 91583). Every 429 also arms a client-wide
// cool-down that all callers wait out before any attempt, first ones included,
// so the IP can actually cool down (task 91585).
func (c *Client) withRetry(ctx context.Context, call func() error) error {
	var err error
	attempts := rpcAttempts
	for attempt := 1; attempt <= attempts; attempt++ {
		if err = c.cool.wait(ctx); err != nil {
			return err
		}
		if err = call(); err == nil {
			return nil
		}
		if errors.Is(err, rpc.ErrNotFound) ||
			errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return err
		}
		rateLimited := isRateLimited(err)
		if rateLimited {
			attempts = rateLimitAttempts
			until, fresh := c.cool.push(rateLimitBackoff(c.rateLimitBase, attempt))
			if fresh {
				c.log.Warn("rpc rate-limited, cooling down", "until", until.UTC().Format(time.RFC3339))
			}
		}
		if attempt == attempts {
			break
		}
		wait := retryBaseWait * time.Duration(attempt)
		if rateLimited {
			wait = rateLimitBackoff(c.rateLimitBase, attempt)
		}
		c.log.Warn("rpc call failed, retrying", "attempt", attempt, "rate_limited", rateLimited, "err", err)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(wait):
		}
	}
	return fmt.Errorf("rpc failed after %d attempts: %w", attempts, err)
}

// isRateLimited reports a 429 from the RPC node: an HTTP 429 the solana-go client
// cannot decode (*jsonrpc.HTTPError) or a JSON-RPC error with code 429 (public
// devnet: "Connection rate limits exceeded"). Retry-After is not exposed, so the
// backoff below is time-based only.
func isRateLimited(err error) bool {
	var httpErr *jsonrpc.HTTPError
	var rpcErr *jsonrpc.RPCError
	return errors.As(err, &httpErr) && httpErr.Code == http.StatusTooManyRequests ||
		errors.As(err, &rpcErr) && rpcErr.Code == http.StatusTooManyRequests
}

// rateLimitBackoff is the 429 wait before retry `attempt`: base doubled per
// attempt (0.5 s, 1 s, 2 s …), jittered ±25% so the two registrar boxes that
// share one RPC key do not retry in lockstep.
func rateLimitBackoff(base time.Duration, attempt int) time.Duration {
	wait := base << (attempt - 1)
	jittered := time.Duration(float64(wait) * (0.75 + 0.5*rand.Float64()))
	return max(jittered, time.Millisecond)
}

// ActionRecord pairs a CorporateAction PDA with its decoded state.
type ActionRecord struct {
	PDA    solana.PublicKey
	Action *CorporateAction
}

// FetchActionsBySeries lists a series' CorporateAction accounts (memcmp on
// CorporateAction.series at offset 9 = discriminator + bump), oldest first.
func (c *Client) FetchActionsBySeries(ctx context.Context, series solana.PublicKey) ([]ActionRecord, error) {
	recs, err := c.GetProgramAccounts(ctx, mustDiscriminator("CorporateAction"),
		[]rpc.RPCFilterMemcmp{{Offset: 9, Bytes: solana.Base58(series[:])}})
	if err != nil {
		return nil, fmt.Errorf("scan actions of %s: %w", series, err)
	}
	out := make([]ActionRecord, 0, len(recs))
	for _, rec := range recs {
		body, err := stripDiscriminator(rec.Data, "CorporateAction")
		if err != nil {
			return nil, fmt.Errorf("scan actions %s: %w", rec.Pubkey, err)
		}
		a, err := DecodeCorporateAction(body)
		if err != nil {
			return nil, fmt.Errorf("scan actions %s: %w", rec.Pubkey, err)
		}
		out = append(out, ActionRecord{PDA: rec.Pubkey, Action: a})
	}
	slices.SortFunc(out, func(a, b ActionRecord) int { return int(a.Action.Index) - int(b.Action.Index) })
	return out, nil
}

// SeriesPDA derives ["series", mint] under the program — shared by every caller that must match ingested
// events (keyed by the PDA) against a bond mint, without the boot-time `series` mirror (task 91564).
func SeriesPDA(program, mint solana.PublicKey) (solana.PublicKey, error) {
	pda, _, err := solana.FindProgramAddress([][]byte{[]byte("series"), mint[:]}, program)
	return pda, err
}

// SeriesPDA derives ["series", mint] under the client's program.
func (c *Client) SeriesPDA(mint solana.PublicKey) (solana.PublicKey, error) {
	return SeriesPDA(c.program, mint)
}

// USDCDevnet is Circle's devnet USDC mint; any other cash mint is the test tenge (tKZT).
const USDCDevnet = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"

// CashCurrency labels a cash mint for display.
func CashCurrency(mint solana.PublicKey) string {
	if mint.String() == USDCDevnet {
		return "USDC"
	}
	return "tKZT"
}

// FetchPayoutRoutesBySeries returns the payout routes chosen by the series' investors (plan 15 D6). Routes are keyed
// by investor PDA only, so this scans every PayoutRoute and keeps the series' own; holders without a route are absent.
func (c *Client) FetchPayoutRoutesBySeries(ctx context.Context, series solana.PublicKey) ([]PayoutRouteRecord, error) {
	investors, err := c.FetchInvestorsBySeries(ctx, series)
	if err != nil {
		return nil, err
	}
	mine := make(map[solana.PublicKey]bool, len(investors))
	for _, inv := range investors {
		mine[inv.PDA] = true
	}
	disc, err := AccountDiscriminator("PayoutRoute")
	if err != nil {
		return nil, err
	}
	recs, err := c.GetProgramAccounts(ctx, disc, nil)
	if err != nil {
		return nil, fmt.Errorf("scan payout routes: %w", err)
	}
	out := make([]PayoutRouteRecord, 0, len(recs))
	for _, rec := range recs {
		p, err := DecodePayoutRoute(rec.Data[8:])
		if err != nil {
			return nil, fmt.Errorf("decode payout route %s: %w", rec.Pubkey, err)
		}
		if mine[p.Investor] {
			out = append(out, PayoutRouteRecord{PDA: rec.Pubkey, Route: p})
		}
	}
	return out, nil
}

// PayoutRoutePDA derives ["route", investor] under the program (plan 15 D6).
func (c *Client) PayoutRoutePDA(investor solana.PublicKey) (solana.PublicKey, error) {
	pda, _, err := solana.FindProgramAddress([][]byte{[]byte("route"), investor[:]}, c.program)
	return pda, err
}

// FetchPayoutRoute decodes the investor's PayoutRoute account; nil when the holder never set one
// (payouts then go to the registered wallet cash account).
func (c *Client) FetchPayoutRoute(ctx context.Context, investor solana.PublicKey) (*PayoutRoute, error) {
	pda, err := c.PayoutRoutePDA(investor)
	if err != nil {
		return nil, err
	}
	data, err := c.GetAccount(ctx, pda)
	if err != nil {
		return nil, fmt.Errorf("fetch payout route %s: %w", pda, err)
	}
	if data == nil {
		return nil, nil
	}
	body, err := stripDiscriminator(data, "PayoutRoute")
	if err != nil {
		return nil, fmt.Errorf("fetch payout route %s: %w", pda, err)
	}
	return DecodePayoutRoute(body)
}

// FetchInvestorsByOwner lists an owner's Investor accounts across every series (public holder lookup,
// task 1525), sorted by series pubkey ascending. memcmp offset 41 = discriminator + bump + series.
func (c *Client) FetchInvestorsByOwner(ctx context.Context, owner solana.PublicKey) ([]InvestorRecord, error) {
	recs, err := c.GetProgramAccounts(ctx, mustDiscriminator("Investor"),
		[]rpc.RPCFilterMemcmp{{Offset: 41, Bytes: solana.Base58(owner[:])}})
	if err != nil {
		return nil, fmt.Errorf("scan investors of %s: %w", owner, err)
	}
	out := make([]InvestorRecord, 0, len(recs))
	for _, rec := range recs {
		body, err := stripDiscriminator(rec.Data, "Investor")
		if err != nil {
			return nil, fmt.Errorf("scan investors %s: %w", rec.Pubkey, err)
		}
		inv, err := DecodeInvestor(body)
		if err != nil {
			return nil, fmt.Errorf("scan investors %s: %w", rec.Pubkey, err)
		}
		out = append(out, InvestorRecord{PDA: rec.Pubkey, Investor: inv})
	}
	slices.SortFunc(out, func(a, b InvestorRecord) int { return bytes.Compare(a.Investor.Series[:], b.Investor.Series[:]) })
	return out, nil
}

// FetchEntitlementsByOwner lists an owner's Entitlement accounts across every action (public holder
// lookup, task 1525), sorted by action pubkey ascending. memcmp offset 41 = discriminator + bump + action.
func (c *Client) FetchEntitlementsByOwner(ctx context.Context, owner solana.PublicKey) ([]EntitlementRecord, error) {
	recs, err := c.GetProgramAccounts(ctx, mustDiscriminator("Entitlement"),
		[]rpc.RPCFilterMemcmp{{Offset: 41, Bytes: solana.Base58(owner[:])}})
	if err != nil {
		return nil, fmt.Errorf("scan entitlements of %s: %w", owner, err)
	}
	out := make([]EntitlementRecord, 0, len(recs))
	for _, rec := range recs {
		body, err := stripDiscriminator(rec.Data, "Entitlement")
		if err != nil {
			return nil, fmt.Errorf("scan entitlements %s: %w", rec.Pubkey, err)
		}
		e, err := DecodeEntitlement(body)
		if err != nil {
			return nil, fmt.Errorf("scan entitlements %s: %w", rec.Pubkey, err)
		}
		out = append(out, EntitlementRecord{PDA: rec.Pubkey, Entitlement: e})
	}
	slices.SortFunc(out, func(a, b EntitlementRecord) int {
		return bytes.Compare(a.Entitlement.Action[:], b.Entitlement.Action[:])
	})
	return out, nil
}
