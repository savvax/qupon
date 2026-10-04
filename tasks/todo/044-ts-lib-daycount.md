---
id: 044
title: TS day-count + entitlement library mirroring the Rust crate, tested against fixtures
agent: glm
tier: T0
depends_on: [001, 003]
verify: make verify
timeout_min: 30
---
## Goal
Pure TypeScript port of the math so the CLI, scripts and web app compute dates and amounts exactly like the program.

## Read first
- docs/03-domain.md (§2, §3)
- fixtures/entitlement.json
- crates/entitlement/src/lib.rs

## Steps
1. `clients/ts/src/lib/daycount.ts`: `Ymd`, `accrualDays(dc, start, end)` (30E/360, ACT/365; ACT/ACT throws), `fromUnixUtc`, `packYmd`; `clients/ts/src/lib/entitlement.ts`: `roundHalfUp`, `computeEntitlement(...)` with bigint.
2. Vitest iterates `fixtures/entitlement.json` (both arrays); property test: Σ holders within `holders` of supply × per-unit.

## Acceptance criteria
- [ ] All fixture ids pass; no other files touched (file ownership: `src/lib/daycount.ts`, `src/lib/entitlement.ts`, their tests).

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/044.md`, then print exactly `DONE:044` or `BLOCKED:044 <reason>`.
