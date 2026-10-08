---
id: 1402
title: Program: PCAL completes like INTR, no burn; escrow surplus sweep
agent: claude
tier: T0
depends_on: [1401]
verify: make verify
timeout_min: 90
---
## Goal
Two program defects from the 2026-10-09 audit:
1. PCAL: `complete_action` (settle.rs ~L287) sends every non-INTR kind to Retiring → `retire_batch` burns all units. For PartialRedemption: status Completed, `series.open_action=None`, series stays Active, record the factor (or reduce outstanding face) so later coupons use the remaining principal.
2. Escrow surplus is stuck forever: `fund_action` (settle.rs ~L63) accepts any amount; nothing sweeps. Cap the transfer at `required - balance` and add `sweep_escrow` (operator; action Completed or Retiring/Closed; remaining balance → issuer cash account; close the escrow ATA).

## Read first
docs/02-architecture.md (instruction table: update rows), docs/03-domain.md, settle.rs, retire.rs, announce_action.rs, tests/.

## Acceptance criteria
- LiteSVM: PCAL 2500 bps through complete_action → series Active, retire_batch → WrongStatus, balances = 75% units remain.
- LiteSVM: over-fund attempt transfers only the shortfall; sweep after complete returns surplus and closes escrow; sweep before complete → WrongStatus; non-operator → Unauthorized.
- Codama regen, deploy + verified-build redeploy per memory/README; re-enable PCAL off-chain (revert 1401 guard) in the same change.
- `make verify` green.
