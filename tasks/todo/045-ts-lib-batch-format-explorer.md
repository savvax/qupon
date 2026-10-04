---
id: 045
title: TS helpers: deterministic batching, amount/date formatting, explorer links
agent: flash
tier: T0
depends_on: [001]
verify: make verify
timeout_min: 25
---
## Goal
Small pure helpers shared by CLI, scripts and web; written early so parallel tasks import instead of reinventing.

## Read first
- docs/02-architecture.md (batch sizing, explorer links)
- docs/03-domain.md (§4 ordering)

## Steps
1. `clients/ts/src/lib/batch.ts`: `sortByOwner(items)` (base58 → bytes ascending), `chunk(items, n)`; `src/lib/format.ts`: `formatMinor(amount: bigint, decimals, symbol)` → `500.00 tKZT`, `formatAlmaty(unix)`; `src/lib/explorer.ts`: tx/address links for devnet.
2. Vitest for each with edge cases (0, n-1, n, n+1 items; rounding display).

## Acceptance criteria
- [ ] Tests green; files limited to the three libs + tests.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/045.md`, then print exactly `DONE:045` or `BLOCKED:045 <reason>`.
