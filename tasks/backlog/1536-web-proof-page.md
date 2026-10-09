---
id: 1536
title: proof page — verify every action in the browser
agent: glm
tier: T1
depends_on: [1530, 1521, 1502]
verify: make verify
timeout_min: 90
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1536 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/design/language.md (from 1530)
- apps/web/src/app/globals.css

## Plan section
### Task 1536: proof page — verify every action in the browser

**Agent:** glm · **Depends on:** 1530, 1521, 1502 · **Role:** frontend

- [ ] `/proof/[mint]` (public, also built as a static export: `pnpm --filter @qupon/web build:proof` → `apps/web/out-proof/` deployable to any static host): reads devnet **directly over RPC** (`NEXT_PUBLIC_RPC_URL`, default public devnet) with `@solana/kit` + Codama decoders — no registrar dependency.
- [ ] For each action: recompute every entitlement with `entitlement.ts`, Σunits vs supply at snapshot, set hash (scheme 1) or rolling hash (scheme 0), totals vs escrow movements; show ✓/✗ per check; list every signature with explorer link; disclosure hash check.
- [ ] Implemented-vs-simulated table (shared copy with landing).
- [ ] Unit tests for the verifier (fixtures from `fixtures/accounts`); spec on mocked RPC responses.

**Acceptance:** tests green; static export builds; Opus design score ≥ 8.

## Finish
`make verify` green, commits carry `task: 1536`, `reports/worklog/1536.md` written. Print `DONE:1536` or `BLOCKED:1536 <reason>`.
