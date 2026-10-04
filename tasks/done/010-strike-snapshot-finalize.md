---
id: 010
title: strike_record (pause), snapshot_batch (entitlements + hash), finalize_snapshot (supply check)
agent: claude
tier: T0
depends_on: [009]
verify: make verify
timeout_min: 60
---
## Goal
The record-date mechanism: deterministic, verifiable snapshot while the mint is paused.

## Read first
- docs/03-domain.md (§4)
- docs/02-architecture.md (instructions 8–10)
- docs/04-stack.md (Pausable CPI helper in anchor_spl::token_2022_extensions)

## Steps
1. `strike_record`: registrar or paying_agent; `clock ≥ record_at` else `TooEarly`; CPI `pause` (series PDA = pausable authority); status RecordStruck; `snapshot_slot`. Emit `RecordStruck`.
2. `snapshot_batch`: `remaining_accounts` in triples [Investor, bond ATA, Entitlement]; max 8 triples (`BatchTooLarge`); require mint paused (read PausableConfig); per triple validate owner/mint, skip zero balance, skip existing Entitlement (compare data_len > 0 and discriminator), create Entitlement via `create_account` CPI with PDA seeds (payer = crank signer) and fill using `entitlement::entitlement(...)` with the investor's tax_bps; update totals, `holders_snapshotted`, `snapshot_hash` (anchor_lang::solana_program::hash::hashv). Emit `HolderSnapshotted` per holder.
3. `finalize_snapshot`: `units_snapshotted == mint.supply` else `SupplyMismatch`; rounding drift check; status SnapshotComplete (BMET → VotingOpen). Emit `SnapshotFinalized` with hash.
4. Tests: full snapshot of 3 investors in one batch and in two batches (idempotent re-run of batch 1 changes nothing); finalize fails before all holders are captured; strike before record_at fails; transfer attempt while paused fails.

## Acceptance criteria
- [ ] Tests green; snapshot hash in the test equals an off-chain recomputation done in the test with the same ordering.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/010.md`, then print exactly `DONE:010` or `BLOCKED:010 <reason>`.
