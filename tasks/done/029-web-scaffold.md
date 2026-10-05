---
id: 029
title: Next.js app scaffold: layout, typed API client from openapi.yaml (mock server for dev), wallet provider, series list and series detail pages
agent: glm
tier: T1
depends_on: [049]
verify: make verify
timeout_min: 60
---
## Goal
Start the Registrar Console: readable, calm, with every amount and status rendered from the Go API.

## Read first
- docs/02-architecture.md (Web app)
- docs/01-product.md (personas)
- services/registrar/openapi.yaml

## Steps
1. `apps/web`: Next.js 15 (app router, TS strict), Tailwind, `lib/api.ts` typed fetchers generated from `services/registrar/openapi.yaml` (`openapi-typescript`), a Prism/MSW mock of the API for local dev so the UI can be built before the Go API exists, wallet-adapter provider (Phantom, Backpack, Solflare) with devnet endpoint from env. Primitives (StatusChip, ExplorerLink, SimulatedBadge, AmountCell, Timeline) come from task 050 — stub them minimally here and let 050 replace them.
2. Pages: `/` series list (ticker, ISIN, face, coupon, frequency, next coupon date, status badge) · `/series/[mint]` terms card, schedule table (past/next coupons), holders table (owner short, units, status), actions list.
3. Design: monospace for pubkeys/amounts, status chips (Announced … Completed), `SIMULATED` badges component, explorer link component.
4. `pnpm typecheck`, `pnpm lint`, basic vitest for formatters (amount/date).

## Acceptance criteria
- [ ] `pnpm dev` shows the demo series from the running API; lint/typecheck green.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/029.md`, then print exactly `DONE:029` or `BLOCKED:029 <reason>`.
