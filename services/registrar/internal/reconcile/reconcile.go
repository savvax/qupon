// Package reconcile independently verifies a snapshotted corporate action:
// the registrar recomputes every holder's entitlement from chain balances and
// compares the result with the Entitlement PDAs the program wrote — the
// control a CSD would run (docs/03-domain.md §4).
package reconcile

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"slices"
	"time"

	solana "github.com/solana-foundation/solana-go/v2"

	"github.com/qupon-kz/qupon/services/registrar/internal/chain"
	"github.com/qupon-kz/qupon/services/registrar/internal/entitlement"
)

// Reader is the chain access Run needs; *chain.Client satisfies it.
type Reader interface {
	FetchSeries(ctx context.Context, pda solana.PublicKey) (*chain.Series, error)
	FetchCorporateAction(ctx context.Context, pda solana.PublicKey) (*chain.CorporateAction, error)
	FetchMint(ctx context.Context, mint solana.PublicKey) (*chain.Mint, error)
	FetchInvestorsBySeries(ctx context.Context, series solana.PublicKey) ([]chain.InvestorRecord, error)
	FetchEntitlementsByAction(ctx context.Context, action solana.PublicKey) ([]chain.EntitlementRecord, error)
	// FetchTokenAccountAt reads a token account with minContextSlot = minSlot
	// (0 = unset). The RPC node cannot serve historical state, so snapshot
	// balances are read as current balances while the mint is paused.
	FetchTokenAccountAt(ctx context.Context, addr solana.PublicKey, minSlot uint64) (*chain.TokenAccount, error)
}

// ErrActionNotFound: no CorporateAction account at the given address.
var ErrActionNotFound = errors.New("reconcile: corporate action not found")

// DefaultReport describes a defaulted action: the escrow shortfall while uncured, the cure time once funded.
type DefaultReport struct {
	DefaultedAt   int64  `json:"defaultedAt"`
	CuredAt       int64  `json:"curedAt,omitempty"` // 0 = still in default
	Required      uint64 `json:"required"`          // net + tax + principal
	EscrowBalance uint64 `json:"escrowBalance"`
	Shortfall     uint64 `json:"shortfall"` // required − escrow (0 once cured)
}

// Mismatch reasons.
const (
	ReasonMissingEntitlement    = "missing_entitlement"    // holder with balance, no Entitlement PDA
	ReasonUnexpectedEntitlement = "unexpected_entitlement" // Entitlement PDA without a matching balance
	ReasonEntitlementMismatch   = "entitlement_mismatch"   // recomputed fields differ from the PDA
	ReasonATAMismatch           = "ata_mismatch"           // bond ATA missing or owner/mint wrong
)

// Entry is one side (expected or on-chain) of a holder comparison, in minor
// units of the settlement currency.
type Entry struct {
	Units     uint64 `json:"units"`
	Gross     uint64 `json:"gross"`
	Tax       uint64 `json:"tax"`
	Net       uint64 `json:"net"`
	Principal uint64 `json:"principal"`
}

func entryFromEntitlement(e *entitlement.Entitlement, units uint64) Entry {
	return Entry{Units: units, Gross: e.Gross, Tax: e.Tax, Net: e.Net, Principal: e.Principal}
}

func entryFromChain(e *chain.Entitlement) Entry {
	return Entry{Units: e.Units, Gross: e.Gross, Tax: e.Tax, Net: e.Net, Principal: e.Principal}
}

// diffFields lists every entry field that differs (nil when equal).
func (a Entry) diffFields(b Entry) []string {
	var out []string
	if a.Units != b.Units {
		out = append(out, "units")
	}
	if a.Gross != b.Gross {
		out = append(out, "gross")
	}
	if a.Tax != b.Tax {
		out = append(out, "tax")
	}
	if a.Net != b.Net {
		out = append(out, "net")
	}
	if a.Principal != b.Principal {
		out = append(out, "principal")
	}
	return out
}

// Mismatch is one holder-level discrepancy.
type Mismatch struct {
	Owner    string   `json:"owner"`
	Reason   string   `json:"reason"`
	Fields   []string `json:"fields,omitempty"` // differing fields, entitlement_mismatch only
	Expected *Entry   `json:"expected,omitempty"`
	Onchain  *Entry   `json:"onchain,omitempty"`
}

// Totals sums one side of the comparison (Holders counts snapshotted holders).
type Totals struct {
	Units     uint64 `json:"units"`
	Holders   uint32 `json:"holders"`
	Gross     uint64 `json:"gross"`
	Tax       uint64 `json:"tax"`
	Net       uint64 `json:"net"`
	Principal uint64 `json:"principal"`
}

func (t *Totals) add(e Entry) {
	t.Units += e.Units
	t.Holders++
	t.Gross += e.Gross
	t.Tax += e.Tax
	t.Net += e.Net
	t.Principal += e.Principal
}

// Report is the reconciliation result served by GET /actions/{pda}/reconcile.
type Report struct {
	ActionPda        string     `json:"actionPda"`
	ActionStatus     string     `json:"actionStatus"`
	Ok               bool       `json:"ok"`
	Holders          int        `json:"holders"` // investors with non-zero balance at read time
	Mismatches       []Mismatch `json:"mismatches"`
	ExpectedHash     string     `json:"expectedHash"` // sha256 chain recomputed owner-ascending
	OnchainHash      string     `json:"onchainHash"`
	HashMatches      bool       `json:"hashMatches"`
	// HashScheme (plan 15 D3): 0 = rolling sha256 chain over owner-sorted holders, 1 = order-independent set hash.
	HashScheme uint8 `json:"hashScheme"`
	Supply           uint64     `json:"supply"` // bond mint supply
	UnitsSnapshotted uint64     `json:"unitsSnapshotted"`
	ExpectedTotals   Totals     `json:"expectedTotals"`
	OnchainTotals    Totals     `json:"onchainTotals"`
	TotalsMatch      bool       `json:"totalsMatch"`
	CheckedAt        int64      `json:"checkedAt"` // unix seconds
	// BankPending: bank-routed payouts handed to the paying agent, not yet confirmed (plan 15 D6); the action cannot
	// complete while it is non-zero.
	BankPending uint32 `json:"bankPending"`
	// Default is set once the action was declared in default (plan 15 D4).
	Default *DefaultReport `json:"default,omitempty"`
}

// Run reconciles the action at pda against independently recomputed math.
// Balances are read pinned to action.snapshot_slot (minContextSlot); because
// RPC serves no historical state, this equals the snapshot balance while the
// mint is paused, and stays valid until holders move bonds after the mint
// resumes or a redemption retires them — from then on the report flags those
// movements as mismatches, which is the honest answer for a balance-vs-record
// control run after the fact.
func Run(ctx context.Context, rd Reader, actionPDA solana.PublicKey) (*Report, error) {
	action, err := rd.FetchCorporateAction(ctx, actionPDA)
	if err != nil {
		return nil, fmt.Errorf("reconcile %s: %w", actionPDA, err)
	}
	if action == nil {
		return nil, ErrActionNotFound
	}
	series, err := rd.FetchSeries(ctx, action.Series)
	if err != nil {
		return nil, fmt.Errorf("reconcile %s: %w", actionPDA, err)
	}
	if series == nil {
		return nil, fmt.Errorf("reconcile %s: series %s missing: %w", actionPDA, action.Series, ErrActionNotFound)
	}
	mint, err := rd.FetchMint(ctx, series.Mint)
	if err != nil {
		return nil, fmt.Errorf("reconcile %s: %w", actionPDA, err)
	}
	if mint == nil {
		return nil, fmt.Errorf("reconcile %s: mint %s missing: %w", actionPDA, series.Mint, ErrActionNotFound)
	}
	investors, err := rd.FetchInvestorsBySeries(ctx, action.Series)
	if err != nil {
		return nil, fmt.Errorf("reconcile %s: %w", actionPDA, err)
	}
	ents, err := rd.FetchEntitlementsByAction(ctx, actionPDA)
	if err != nil {
		return nil, fmt.Errorf("reconcile %s: %w", actionPDA, err)
	}

	kind, err := entitlement.KindFromCode(action.Kind)
	if err != nil {
		return nil, fmt.Errorf("reconcile %s: %w", actionPDA, err)
	}
	dc, err := entitlement.DayCountFromCode(series.DayCount)
	if err != nil {
		return nil, fmt.Errorf("reconcile %s: %w", actionPDA, err)
	}

	// The hash order is the correctness core: owner pubkey bytes ascending.
	slices.SortFunc(investors, func(a, b chain.InvestorRecord) int {
		return bytes.Compare(a.Investor.Owner[:], b.Investor.Owner[:])
	})
	byOwner := make(map[solana.PublicKey]*chain.Entitlement, len(ents))
	for _, rec := range ents {
		byOwner[rec.Entitlement.Owner] = rec.Entitlement
	}

	rep := &Report{
		ActionPda:        actionPDA.String(),
		ActionStatus:     chain.ActionStatusName(action.Status),
		Mismatches:       []Mismatch{},
		OnchainHash:      solana.PublicKey(action.SnapshotHash).String(),
		Supply:           mint.Supply,
		UnitsSnapshotted: action.UnitsSnapshotted,
		OnchainTotals: Totals{
			Units:     action.UnitsSnapshotted,
			Holders:   action.HoldersSnapshotted,
			Gross:     action.TotalGross,
			Tax:       action.TotalTax,
			Net:       action.TotalNet,
			Principal: action.TotalPrincipal,
		},
		CheckedAt:   time.Now().Unix(),
		BankPending: action.BankPending,
		HashScheme:  action.HashScheme,
	}
	if action.DefaultedAt != 0 {
		d := &DefaultReport{
			DefaultedAt: action.DefaultedAt,
			CuredAt:     action.CuredAt,
			Required:    action.TotalNet + action.TotalTax + action.TotalPrincipal,
		}
		esc, err := rd.FetchTokenAccountAt(ctx, action.Escrow, 0)
		if err != nil {
			return nil, fmt.Errorf("reconcile %s: escrow: %w", actionPDA, err)
		}
		if esc != nil {
			d.EscrowBalance = esc.Amount
		}
		if action.CuredAt == 0 && d.EscrowBalance < d.Required {
			d.Shortfall = d.Required - d.EscrowBalance
		}
		rep.Default = d
	}

	var hash [32]byte // starts zeroed, like a fresh CorporateAction
	// Hooked series (plan 15 D1'): the transfer-hook gate guarantees each snapshotted position equals its balance at
	// record_at, and positions move again after their snapshot, so units come from the entitlements; amounts, totals
	// and the hash are still recomputed independently. Legacy series read the ATAs at the snapshot slot.
	hooked := series.Hook == 1
	seen := make(map[solana.PublicKey]bool, len(investors))
	for _, ir := range investors {
		inv := ir.Investor
		seen[inv.Owner] = true

		var expected *Entry
		var units uint64
		valid := false
		if hooked {
			if on, ok := byOwner[inv.Owner]; ok && on.Units > 0 {
				units, valid = on.Units, true
			}
		} else {
			ta, err := rd.FetchTokenAccountAt(ctx, inv.BondATA, action.SnapshotSlot)
			if err != nil {
				return nil, fmt.Errorf("reconcile %s: fetch ata %s: %w", actionPDA, inv.BondATA, err)
			}
			valid = ta != nil && ta.Owner == inv.Owner && ta.Mint == series.Mint && ta.Amount > 0
			if ta != nil && (ta.Owner != inv.Owner || ta.Mint != series.Mint) {
				rep.Mismatches = append(rep.Mismatches, Mismatch{
					Owner:  inv.Owner.String(),
					Reason: ReasonATAMismatch,
				})
			}
			if ta != nil {
				units = ta.Amount
			}
		}
		if valid {
			e, err := entitlement.Compute(units, series.FaceValue, action.RateBps, dc,
				action.AccrualDays, inv.TaxRateBps, kind, action.FactorBps)
			if err != nil {
				return nil, fmt.Errorf("reconcile %s: compute %s: %w", actionPDA, inv.Owner, err)
			}
			exp := entryFromEntitlement(&e, units)
			expected = &exp
			rep.Holders++
			rep.ExpectedTotals.add(exp)
			if action.HashScheme == 1 {
				xorInto(&hash, SetHashLeaf(actionPDA, inv.Owner, units))
			} else {
				hash = hashStep(&hash, inv.Owner, units)
			}
		}

		on, ok := byOwner[inv.Owner]
		switch {
		case expected != nil && !ok:
			rep.Mismatches = append(rep.Mismatches, Mismatch{
				Owner:    inv.Owner.String(),
				Reason:   ReasonMissingEntitlement,
				Expected: expected,
			})
		case expected == nil && ok:
			oc := entryFromChain(on)
			rep.Mismatches = append(rep.Mismatches, Mismatch{
				Owner:   inv.Owner.String(),
				Reason:  ReasonUnexpectedEntitlement,
				Onchain: &oc,
			})
		case expected != nil && ok:
			oc := entryFromChain(on)
			if fields := expected.diffFields(oc); fields != nil {
				rep.Mismatches = append(rep.Mismatches, Mismatch{
					Owner:    inv.Owner.String(),
					Reason:   ReasonEntitlementMismatch,
					Fields:   fields,
					Expected: expected,
					Onchain:  &oc,
				})
			}
		}
	}
	// Entitlements whose owner has no Investor account: impossible via the
	// program's snapshot path, so flag them.
	for _, rec := range ents {
		if !seen[rec.Entitlement.Owner] {
			oc := entryFromChain(rec.Entitlement)
			rep.Mismatches = append(rep.Mismatches, Mismatch{
				Owner:   rec.Entitlement.Owner.String(),
				Reason:  ReasonUnexpectedEntitlement,
				Onchain: &oc,
			})
		}
	}

	rep.ExpectedHash = solana.PublicKey(hash).String()
	rep.HashMatches = hash == action.SnapshotHash
	rep.TotalsMatch = rep.ExpectedTotals == rep.OnchainTotals
	rep.Ok = len(rep.Mismatches) == 0 && rep.HashMatches && rep.TotalsMatch
	return rep, nil
}

// SetHashLeaf is hook.rs set_hash_leaf: sha256("qupon:snap:v1" ‖ action ‖ owner ‖ units_le).
func SetHashLeaf(action, owner solana.PublicKey, units uint64) [32]byte {
	buf := make([]byte, 0, 13+32+32+8)
	buf = append(buf, "qupon:snap:v1"...)
	buf = append(buf, action[:]...)
	buf = append(buf, owner[:]...)
	buf = binary.LittleEndian.AppendUint64(buf, units)
	return sha256.Sum256(buf)
}

func xorInto(acc *[32]byte, leaf [32]byte) {
	for i := range acc {
		acc[i] ^= leaf[i]
	}
}

// hashStep is snapshot.rs snapshot_hash_step: sha256(prev ‖ owner ‖ units_le).
func hashStep(prev *[32]byte, owner solana.PublicKey, units uint64) [32]byte {
	var buf [32 + 32 + 8]byte
	copy(buf[:32], prev[:])
	copy(buf[32:64], owner[:])
	binary.LittleEndian.PutUint64(buf[64:], units)
	return sha256.Sum256(buf[:])
}
