// Package disclosure anchors the official seev.031 notification of an action
// on chain (plan 15 D9): right after announce the registrar renders the
// deterministic bytes and runs `qupon disclosure:attach`, whose sha256 lands
// on the CorporateAction. The same bytes are re-served by the API so anyone
// can re-hash and compare (GET /actions/{pda}/disclosure-hash).
package disclosure

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	solana "github.com/solana-foundation/solana-go/v2"
	"log/slog"
	"os"
	"strings"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/executor"
	"github.com/qupon-kz/qupon/services/registrar/internal/iso20022"
)

// cluster labels SplmtryData — the service is devnet-only.
const cluster = "devnet"

// Chain is what the anchoring needs from the chain; *chain.Client implements it.
type Chain interface {
	FetchCorporateAction(ctx context.Context, pda solana.PublicKey) (*chain.CorporateAction, error)
	FetchSeries(ctx context.Context, pda solana.PublicKey) (*chain.Series, error)
	ProgramID() solana.PublicKey
}

// Exec runs the qupon CLI; *executor.Executor implements it.
type Exec interface {
	Run(ctx context.Context, args ...string) (executor.Result, error)
	SeriesName(mint string) (string, error)
}

// Deps wires the anchoring; a zero field makes Attach a no-op (tests, dry runs).
type Deps struct {
	Chain Chain
	Exec  Exec
	Log   *slog.Logger
}

// AnchoredRefs are the SplmtryData refs of the anchored seev.031: program id
// and cluster only. The snapshot slot is deliberately absent — it is set after
// announce and would change the bytes, breaking the anchored hash.
func AnchoredRefs(programID string) iso20022.Refs {
	return iso20022.Refs{ProgramID: programID, Cluster: cluster}
}

// Anchored renders the deterministic seev.031 bytes for an action: what
// disclosure:attach hashes, what GET /actions/{pda}/disclosure-hash re-hashes.
func Anchored(act *chain.CorporateAction, series *chain.Series, programID string) ([]byte, error) {
	doc, err := iso20022.BuildSeev031(act, series, AnchoredRefs(programID))
	if err != nil {
		return nil, fmt.Errorf("build seev.031: %w", err)
	}
	body, err := iso20022.Marshal(doc)
	if err != nil {
		return nil, fmt.Errorf("marshal seev.031: %w", err)
	}
	return body, nil
}

// Hash is the sha256 hex of the anchored bytes (lowercase, 64 chars).
func Hash(body []byte) string { sum := sha256.Sum256(body); return hex.EncodeToString(sum[:]) }

// OnchainHash is the anchored hash as served by the API: hex, "" when zero.
func OnchainHash(act *chain.CorporateAction) string {
	var zero [32]byte
	if act.DisclosureHash == zero {
		return ""
	}
	return hex.EncodeToString(act.DisclosureHash[:])
}

// Attach renders the action's deterministic seev.031, writes it to a temp
// file and anchors its sha256 via `qupon disclosure:attach` (idempotent:
// skipped when the action already carries a hash, or the chain answers
// AlreadyAttached). Best-effort — an error is returned for the caller to log,
// never propagated into the announce that already succeeded on chain.
func (d Deps) Attach(ctx context.Context, actionPDA solana.PublicKey) error {
	if d.Chain == nil || d.Exec == nil {
		return nil
	}
	log := d.Log
	if log == nil {
		log = slog.Default()
	}
	act, err := d.Chain.FetchCorporateAction(ctx, actionPDA)
	if err != nil {
		return fmt.Errorf("disclosure attach: fetch action: %w", err)
	}
	if act == nil {
		return fmt.Errorf("disclosure attach: no action at %s", actionPDA)
	}
	if h := OnchainHash(act); h != "" { // already anchored (announce retry)
		return nil
	}
	series, err := d.Chain.FetchSeries(ctx, act.Series)
	if err != nil {
		return fmt.Errorf("disclosure attach: fetch series: %w", err)
	}
	if series == nil {
		return fmt.Errorf("disclosure attach: series %s not found", act.Series)
	}
	name, err := d.Exec.SeriesName(series.Mint.String())
	if err != nil {
		return fmt.Errorf("disclosure attach: %w", err)
	}
	body, err := Anchored(act, series, d.Chain.ProgramID().String())
	if err != nil {
		return fmt.Errorf("disclosure attach: %w", err)
	}

	f, err := os.CreateTemp("", "seev031-*.xml")
	if err != nil {
		return fmt.Errorf("disclosure attach: temp file: %w", err)
	}
	defer func() { _ = os.Remove(f.Name()) }()
	if _, err := f.Write(body); err != nil {
		_ = f.Close()
		return fmt.Errorf("disclosure attach: write %s: %w", f.Name(), err)
	}

	// --index omitted: attach runs right after announce, while the action is
	// still the series' open action (the CLI defaults to it).
	res, err := d.Exec.Run(ctx, "disclosure:attach", "--series", name, "--file", f.Name())
	if err != nil {
		return fmt.Errorf("disclosure attach: %w", err)
	}
	if !res.OK && !alreadyAttached(res.Error) {
		return fmt.Errorf("disclosure attach refused: %s", res.Error)
	}
	log.Info("disclosure anchored", "action", actionPDA.String(), "sha256", Hash(body), "sig", res.Signature)
	return nil
}

func alreadyAttached(cliErr string) bool {
	// The instruction refuses a second anchor (AlreadyAttached); a racing
	// attach already did the job.
	return strings.Contains(cliErr, "AlreadyAttached")
}
