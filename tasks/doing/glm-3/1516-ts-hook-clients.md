---
id: 1516
title: clients for hooked series (mint, init_hook, transfer extras)
agent: glm
tier: T0
depends_on: [1510]
verify: make verify
timeout_min: 75
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1516 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/02-architecture.md
- docs/03-domain.md
- programs/qupon_bonds/tests/common/mod.rs
- programs/qupon_bonds/tests/hook.rs (transfer-hook gate, spike 1509)

## Plan section
### Task 1516: clients for hooked series (mint, init_hook, transfer extras)

**Agent:** glm · **Depends on:** 1510 · **Role:** ts-client

**Files:** `clients/ts/src/lib/bondMint.ts` / `bondMintFlow.ts` (new series: add `TransferHook` extension with program id = Qupon and authority = series PDA; after `init_series` send `init_hook`), `clients/ts/src/lib/hook.ts` (new: `hookExtras(series, srcOwner, dstOwner): AccountMeta[]` = [series, checkpoint(src), checkpoint(dst), program id, extra-metas PDA] read-only; `withHookExtras(ix, …)`), `clients/ts/src/commands/trade.ts` (fund: seller → escrow transfer with extras; settle/cancel/reclaim: append the bond leg's extras and set `leg_a_extras_count`; before settle after a record date prepend `snapshot_batch` for the seller group and the buyer), any demo transfer in `scripts/demo-full.ts`, `apps/web/src/app/(cabinet)/investor/_components/OpenTrades.tsx` + `src/lib/portal.ts` (wallet-signed funding transfer with extras), tests `hook.test.ts` (extras derivation vs fixtures: the PDAs for a known mint/owners), `trade.test.ts` updates.
- [ ] Legacy (non-hooked) series: no extras (detect `series.hook == 0`).
- [ ] Commit `feat(cli,web): hooked bond mints and transfer-hook extras on every bond transfer`.

**Acceptance:** unit tests derive the same PDAs as the program tests; `qupon series:create` on LiteSVM-free arg tests shows the TransferHook extension and the `init_hook` call; `make verify` green.

## Finish
`make verify` green, commits carry `task: 1516`, `reports/worklog/1516.md` written. Print `DONE:1516` or `BLOCKED:1516 <reason>`.
