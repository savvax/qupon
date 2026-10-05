---
id: 9035
title: CLI action:retire also burns orphan units ([Investor, ATA] pairs) so close_series cannot be blocked
agent: glm
tier: T1
depends_on: [018, 035]
verify: make verify
timeout_min: 30
---
## Goal
Since task 035, `retire_batch` accepts two pair shapes: [Entitlement, bond ATA] (snapshotted holders) and [Investor, bond ATA] (registered wallets that received units after the redemption resume and have no Entitlement). The CLI must send both so `series:close` never fails with SupplyNotZero.

## Read first
- programs/qupon_bonds/src/instructions/retire.rs (doc comment), docs/02-architecture.md row 14, docs/SECURITY_NOTES.md
- clients/ts CLI `action:retire` (task 018), generated client

## Steps
1. `action:retire`: after the entitlement pairs, list all Investor PDAs of the series (getProgramAccounts, discriminator + memcmp series at offset 9); for each whose bond ATA balance > 0 and that has no Entitlement for the action, add an [Investor PDA, bond ATA] pair; batch ≤ 12 pairs per tx.
2. Vitest: unit test of the pair-building function with a fake account list (entitled, orphan with balance, orphan with zero balance → skipped).

## Acceptance criteria
- [ ] Pair-building test passes; `make verify` green. Do not run against devnet.
