package ingest

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"
	"github.com/solana-foundation/solana-go/v2/rpc"

	"github.com/qupon-kz/qupon/services/registrar/internal/store"
)

const (
	pageSize    = 1000 // getSignaturesForAddress page limit
	backfillCap = 2000 // first run (empty cursor): ingest at most this many recent txs
	txNotFound  = "not found"
)

// Poller keeps the activity table in sync with on-chain qupon_bonds events by
// polling getSignaturesForAddress + getTransaction every interval.
type Poller struct {
	rpc      *rpc.Client
	program  solana.PublicKey
	st       *store.Store
	log      *slog.Logger
	interval time.Duration
}

func NewPoller(rpcURL string, program solana.PublicKey, st *store.Store, log *slog.Logger) *Poller {
	return &Poller{
		rpc:      rpc.New(rpcURL),
		program:  program,
		st:       st,
		log:      log,
		interval: 10 * time.Second,
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
		limit := pageSize
		opts := &rpc.GetSignaturesForAddressOpts{Limit: &limit}
		if !before.IsZero() {
			opts.Before = before
		}
		if !until.IsZero() {
			opts.Until = until
		}
		page, err := p.rpc.GetSignaturesForAddressWithOpts(ctx, p.program, opts)
		if err != nil {
			return nil, fmt.Errorf("getSignaturesForAddress: %w", err)
		}
		pages = append(pages, page...)
		if len(page) == 0 {
			break
		}
		oldest := page[len(page)-1].Signature
		if len(page) < pageSize || oldest == until || len(pages) >= backfillCap {
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

// ingestTx fetches one transaction and stores its events.
func (p *Poller) ingestTx(ctx context.Context, s *rpc.TransactionSignature) error {
	zero := uint64(0)
	tx, err := p.rpc.GetTransaction(ctx, s.Signature, &rpc.GetTransactionOpts{
		Encoding:                       solana.EncodingJSON,
		MaxSupportedTransactionVersion: &zero,
	})
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), txNotFound) {
			p.log.Warn("ingest: transaction pruned from history", "sig", s.Signature.String())
			return nil
		}
		return fmt.Errorf("getTransaction %s: %w", s.Signature, err)
	}
	if tx == nil || tx.Meta == nil {
		return nil
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
	}
	return nil
}
