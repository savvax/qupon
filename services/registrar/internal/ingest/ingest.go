package ingest

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync/atomic"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"
	"github.com/solana-foundation/solana-go/v2/rpc"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/notify"
	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

const (
	defaultPageSize    = 1000 // getSignaturesForAddress page limit
	defaultBackfillCap = 2000 // first run (empty cursor): ingest at most this many recent txs
	txNotFound         = "not found"
	freshWindow        = time.Hour // not-found inside this window is retried, not skipped as pruned
)

// errTxNotServed marks a getTransaction "not found" for a signature younger
// than freshWindow: Poll returns it without advancing the cursor so the next
// tick retries (a lagging RPC must not lose events forever).
var errTxNotServed = errors.New("tx not served yet")

// isNotFound reports whether getTransaction failed because the node has no such
// tx: the library returns ErrNotFound for a null result, some nodes answer a
// JSON-RPC error whose message contains "not found".
func isNotFound(err error) bool {
	return err != nil && (errors.Is(err, rpc.ErrNotFound) ||
		strings.Contains(strings.ToLower(err.Error()), txNotFound))
}

// Poller keeps the activity table in sync with on-chain qupon_bonds events by
// polling getSignaturesForAddress + getTransaction every interval.
type Poller struct {
	rpc         *rpc.Client
	fallback    *rpc.Client // public devnet, asked when the primary fails a history call (nil if primary is public)
	program     solana.PublicKey
	st          *store.Store
	log         *slog.Logger
	interval    time.Duration
	pageSize    int // signatures per getSignaturesForAddress call (tests shrink it)
	backfillCap int // first-run cap only; a cursor always pages back to itself

	lastSlot atomic.Uint64 // highest ingested slot; read by GET /admin/system

	// firstSeen: when a not-yet-served signature without a BlockTime was first met, so it ages out of
	// freshWindow like any other (poll loop only, no lock).
	firstSeen map[string]time.Time
}

func NewPoller(rpcURL string, program solana.PublicKey, st *store.Store, log *slog.Logger) *Poller {
	// Keyed RPCs can fail history methods while account reads work (Helius devnet: -32603 on
	// getSignaturesForAddress/getSignatureStatuses, 2026-10-05); public devnet answers them, rate-limited.
	var fallback *rpc.Client
	if rpcURL != rpc.DevNet_RPC {
		fallback = rpc.New(rpc.DevNet_RPC)
	}
	return &Poller{
		rpc:         chain.NewRPC(rpcURL, 0),
		fallback:    fallback,
		program:     program,
		st:          st,
		log:         log,
		interval:    10 * time.Second,
		pageSize:    defaultPageSize,
		backfillCap: defaultBackfillCap,
	}
}

// Run polls until ctx is cancelled; each failure is logged and retried next tick.
func (p *Poller) Run(ctx context.Context) {
	p.log.Info("ingest poller started", "program", p.program.String(), "interval", p.interval.String())
	t := time.NewTicker(p.interval)
	defer t.Stop()
	for {
		if err := p.Poll(ctx); err != nil && ctx.Err() == nil {
			p.log.Error("ingest poll failed", "err", err)
		}
		select {
		case <-ctx.Done():
			p.log.Info("ingest poller stopped")
			return
		case <-t.C:
		}
	}
}

// Poll fetches signatures newer than the persisted cursor, ingests their
// events, then advances the cursor. Safe to re-run: rows dedupe on
// (sig, kind, seq) and the cursor only moves after a successful pass.
func (p *Poller) Poll(ctx context.Context) error {
	cur, err := p.st.IngestCursor(ctx)
	if err != nil {
		return err
	}
	sigs, err := p.fetchNew(ctx, cur)
	if err != nil {
		return err
	}
	if len(sigs) == 0 {
		return nil
	}
	for _, s := range sigs {
		if s.Err != nil {
			continue // failed tx: no committed state transition
		}
		if err := p.ingestTx(ctx, s); err != nil {
			return err
		}
	}
	newest := sigs[len(sigs)-1].Signature.String()
	if err := p.st.SetIngestCursor(ctx, newest); err != nil {
		return err
	}
	p.log.Info("ingest poll done", "txs", len(sigs), "cursor", newest)
	return nil
}

// fetchNew returns signatures newer than cur ("" = start from the newest),
// oldest first. Pages with Before until the cursor is reached or the page is short.
func (p *Poller) fetchNew(ctx context.Context, cur string) ([]*rpc.TransactionSignature, error) {
	var until solana.Signature
	if cur != "" {
		if err := until.UnmarshalText([]byte(cur)); err != nil {
			return nil, fmt.Errorf("parse cursor %q: %w", cur, err)
		}
	}
	var pages []*rpc.TransactionSignature
	var before solana.Signature
	for {
		limit := p.pageSize
		opts := &rpc.GetSignaturesForAddressOpts{Limit: &limit}
		if !before.IsZero() {
			opts.Before = before
		}
		if !until.IsZero() {
			opts.Until = until
		}
		page, err := p.rpc.GetSignaturesForAddressWithOpts(ctx, p.program, opts)
		if err != nil && p.fallback != nil {
			page, err = p.fallback.GetSignaturesForAddressWithOpts(ctx, p.program, opts)
		}
		if err != nil {
			return nil, fmt.Errorf("getSignaturesForAddress: %w", err)
		}
		pages = append(pages, page...)
		if len(page) == 0 {
			break
		}
		oldest := page[len(page)-1].Signature
		// The cap protects only the very first run (empty cursor); with a cursor
		// we keep paging until it is reached so no signature is ever skipped.
		if len(page) < p.pageSize || oldest == until ||
			(until.IsZero() && len(pages) >= p.backfillCap) {
			break
		}
		before = oldest
	}
	// pages are newest→oldest; the feed wants chain order
	out := make([]*rpc.TransactionSignature, 0, len(pages))
	for i := len(pages) - 1; i >= 0; i-- {
		out = append(out, pages[i])
	}
	return out, nil
}

// ingestTx fetches one transaction and stores its events. A getTransaction
// "not found" (or a nil tx) is asked of the fallback RPC too; if both lack it,
// signatures younger than freshWindow return errTxNotServed so Poll retries
// next tick — only older ones are skipped as pruned (nil BlockTime = young).
func (p *Poller) ingestTx(ctx context.Context, s *rpc.TransactionSignature) error {
	zero := uint64(0)
	txOpts := &rpc.GetTransactionOpts{Encoding: solana.EncodingJSON, MaxSupportedTransactionVersion: &zero}
	tx, err := p.rpc.GetTransaction(ctx, s.Signature, txOpts)
	if (err != nil || tx == nil) && p.fallback != nil {
		tx, err = p.fallback.GetTransaction(ctx, s.Signature, txOpts)
	}
	if err == nil && tx == nil {
		err = rpc.ErrNotFound
	}
	if err != nil {
		if !isNotFound(err) {
			return fmt.Errorf("getTransaction %s: %w", s.Signature, err)
		}
		key := s.Signature.String()
		seen := time.Now()
		if s.BlockTime != nil {
			seen = time.Unix(int64(*s.BlockTime), 0)
		} else {
			if p.firstSeen == nil {
				p.firstSeen = map[string]time.Time{}
			}
			if t, ok := p.firstSeen[key]; ok {
				seen = t
			} else {
				p.firstSeen[key] = seen
			}
		}
		if time.Since(seen) > freshWindow {
			delete(p.firstSeen, key)
			p.log.Warn("ingest: transaction pruned from history", "sig", s.Signature.String())
			return nil
		}
		// one warn per tick: Poll stops here and retries the signature next poll
		p.log.Warn("ingest: transaction not served yet, will retry", "sig", s.Signature.String())
		return fmt.Errorf("getTransaction %s: %w", s.Signature, errTxNotServed)
	}
	delete(p.firstSeen, s.Signature.String())
	if tx.Meta == nil {
		return nil
	}
	if tx.Slot > p.lastSlot.Load() { // single writer (the poll loop); the handler reads atomically
		p.lastSlot.Store(tx.Slot)
	}
	events := ParseLogs(tx.Meta.LogMessages)
	if len(events) == 0 {
		return nil
	}
	ts := time.Now().Unix()
	if tx.BlockTime != nil {
		ts = int64(*tx.BlockTime)
	}
	sig := s.Signature.String()
	for seq, ev := range events {
		a := store.Activity{Ts: ts, Kind: ev.Name, Sig: sig, Slot: tx.Slot, Seq: seq}
		if v, ok := ev.Fields["series"].(string); ok {
			a.SeriesMint = &v
		}
		if v, ok := ev.Fields["action"].(string); ok {
			a.ActionPDA = &v
		}
		if a.Payload, err = json.Marshal(ev.Fields); err != nil {
			return fmt.Errorf("marshal %s payload: %w", ev.Name, err)
		}
		inserted, err := p.st.InsertActivity(ctx, a)
		if err != nil {
			return err
		}
		if inserted {
			p.log.Info("ingested event", "kind", ev.Name, "sig", sig, "slot", tx.Slot)
		}
		// fan-out is additive: a failed notification never blocks ingest (the event row is already stored)
		if err := notify.FromEvent(ctx, p.st, a); err != nil {
			p.log.Warn("notify", "kind", ev.Name, "sig", sig, "err", err)
		}
	}
	return nil
}

// LastSlot reports the highest slot the poller has ingested (0 before the first event) — GET /admin/system.
func (p *Poller) LastSlot() uint64 { return p.lastSlot.Load() }
