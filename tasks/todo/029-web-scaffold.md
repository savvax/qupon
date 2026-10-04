---
id: 029
title: Next.js app scaffold: layout, API client, wallet provider, series list and series detail pages
agent: glm
tier: T1
depends_on: [027]
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
1. `apps/web`: Next.js 15 (app router, TS strict), Tailwind, shadcn-style primitives (hand-rolled, no heavy UI kit), `lib/api.ts` typed fetchers from OpenAPI (generate with `openapi-typescript`), wallet-adapter provider (Phantom, Backpack, Solflare) with devnet endpoint from env.
2. Pages: `/` series list (ticker, ISIN, face, coupon, frequency, next coupon date, status badge) · `/series/[mint]` terms card, schedule table (past/next coupons), holders table (owner short, units, status), actions list.
3. Design: monospace for pubkeys/amounts, status chips (Announced … Completed), `SIMULATED` badges component, explorer link component.
4. `pnpm typecheck`, `pnpm lint`, basic vitest for formatters (amount/date).

## Acceptance criteria
- [ ] `pnpm dev` shows the demo series from the running API; lint/typecheck green.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/029.md`, then print exactly `DONE:029` or `BLOCKED:029 <reason>`.
