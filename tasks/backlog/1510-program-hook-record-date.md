---
id: 1510
title: program — hook-gated record date in the product flow, trustless crank, set hash
agent: claude
tier: T0
depends_on: [1509]
verify: make verify
timeout_min: 240
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1510 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/02-architecture.md
- docs/03-domain.md
- programs/qupon_bonds/tests/common/mod.rs
- programs/qupon_bonds/tests/hook.rs (transfer-hook gate, spike 1509)

## Plan section
### Task 1510: program — hook-gated record date in the product flow, trustless crank, set hash

**Agent:** claude (Opus) · **Depends on:** 1509 · **Role:** anchor

**Files:**
- Modify: `programs/qupon_bonds/src/instructions/hook.rs` (remove `mark_snapshotted`; keep `init_hook`, `init_checkpoint`, `execute`; export `fn create_checkpoint(payer, series, owner, last_seq)` used below)
- Modify: `register_investor.rs` (hooked series: create the owner's checkpoint; `last_seq = series.record_seq` if a record is pending and `now ≥ record_at`, else 0 — a new investor held nothing at `record_at` because their ATA was frozen until now), `trade.rs` (`admit_trade` on a hooked series creates the escrow owner's (`swap_dvp`) checkpoint with the same rule), `subscribe.rs` (`subscribe`/`issue_units`: hooked series with `record_at != 0 && now ≥ record_at` → `RecordPending`), `announce_action.rs` (`hash_scheme = 1`; `cancel_action` clears `series.record_at` when hooked)
- Modify: `snapshot.rs`:
  - legacy series: unchanged flow (strike → pause → snapshot → finalize), but **no role check** on strike/snapshot/finalize (anyone);
  - hooked series: `strike_record` is not used (`WrongStatus`); `snapshot_batch(escrow_counts: Vec<u8>)` runs from `now ≥ series.record_at` while the action is Announced or RecordStruck (first batch: status → RecordStruck, `snapshot_slot = slot`, emit `RecordStruck`); per holder the group is `[Investor, bond ATA, Entitlement PDA, Checkpoint]` followed by `escrow_counts[i] × [TradeAdmission, escrow ATA, escrow Checkpoint]` (each admission's `seller == investor.owner` and `escrow` matches); units = own ATA + those escrows; zero units → only advance checkpoints (no Entitlement); every checkpoint touched gets `last_seq = record_seq`; already-advanced checkpoint + existing Entitlement → skip (idempotent);
  - set hash for `hash_scheme == 1` (both paths): `snapshot_hash ^= sha256("qupon:snap:v1" ‖ action ‖ owner ‖ units_le)`;
  - `finalize_snapshot`: Σ units == supply (both paths); hooked: INTR/PCAL/BMET → `series.record_at = 0` (gate off, ex-date trading); REDM/MCAL keep it (register locked); legacy: INTR/PCAL resume right after finalize like BMET; REDM/MCAL stay paused.
- Modify: `settle.rs` (`pay_batch`, `complete_action` no role check; `complete_action` resumes only if the mint is paused), `retire.rs` (`retire_batch` no role check)
- Modify: `error.rs` (append `RecordPending`), `state.rs` (CorporateAction `hash_scheme: u8`, `reserved: [u8; 63]`)
- Modify: `clients/ts/src/commands/action.ts` (`action:snapshot` builds the hooked groups incl. open admissions of each seller, `escrow_counts`; legacy unchanged), `clients/ts/src/lib/batch.ts` if needed; `pnpm codama`
- Modify: Go `internal/chain` (CorporateAction `HashScheme`; Series hook fields; `DecodeCheckpoint`), `internal/reconcile` (scheme 1 set hash; hooked actions count escrowed units to the seller)
- Tests: `tests/hook.rs` (rewrite the spike tests on the product flow), `tests/snapshot.rs`, `tests/trade.rs`, `tests/registry.rs` (new cases only); Go reconcile test
- Docs: `docs/02-architecture.md` rows 7–9, 22–25 and the record-date section; `docs/03-domain.md` §4 (D1' text from the spec)

**Tests (all on a hooked series unless stated):**
- `intr_full_cycle_hooked_outsider_crank`: announce → `record_at` → outsider snapshot (3 groups) → finalize (Σ == 100) → a plain hooked transfer with no snapshot passes (gate off) → issuer funds → outsider pays → complete; cash 50,000 / 125,000 / 325,000.
- `transfer_after_record_needs_snapshot_and_entitlement_is_balance_at_record_at`: 10-unit holder sends 4 in a `[snapshot(both), transfer]` tx → entitlement units 10 (not 6), receiver's entitlement unchanged by the 4.
- `open_trade_across_record_date_is_attributed_to_seller`: 5 units escrowed at `record_at` → seller's entitlement = own + 5; settlement after `record_at` needs the seller group snapshotted (escrow checkpoint advanced) and the buyer's; Σ == supply.
- `mint_blocked_while_record_pending`: `issue_units` after `record_at` → `RecordPending`; after finalize → ok.
- `investor_registered_after_record_can_receive`: new investor's checkpoint starts at `record_seq`; a snapshotted holder can send to them.
- `redemption_record_locks_register`: REDM announced; after `record_at` every transfer → `RecordLocked`, even after snapshot.
- `legacy_series_unchanged_but_permissionless`: non-hooked series, outsider runs strike→snapshot→finalize→pay→complete; INTR resumes after finalize; REDM stays paused.
- `set_hash_independent_of_batch_order` (hooked and legacy), `account_sizes_unchanged`.

**Acceptance:** all tests above pass; all pre-existing tests pass unedited except helper signature updates for `snapshot_batch` (listed in the worklog); CLI `action:snapshot` works for both paths (unit test of the builder); Go reconcile scheme-1 test; `make verify` green.

## Finish
`make verify` green, commits carry `task: 1510`, `reports/worklog/1510.md` written. Print `DONE:1510` or `BLOCKED:1510 <reason>`.
