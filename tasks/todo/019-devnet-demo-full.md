---
id: 019
title: make demo: full lifecycle S0–S4 on devnet with reports/demo-full.md (Gate 1)
agent: glm
tier: T0
depends_on: [016, 018]
verify: make verify
timeout_min: 60
---
## Goal
One command proves all three required scenarios plus MCAL on devnet, producing the report judges can click through.

## Read first
- docs/01-product.md (S0–S4)
- clients/ts/scripts/demo-coupon.ts

## Steps
1. `scripts/demo-full.ts`: QPNb1 in tKZT: issuance → INTR #1 (10%) → BMET (10%→12%, votes 65 For/25 Against/10 Abstain → Approved) → INTR #2 at 12% (per holder 600/1,500/3,900) → REDM (principal + final coupon) → retire → close. BTRK-demo in USDC: issuance (3 holders), INTR, MCAL with accrued days → retire → close. Time compression: record/payment offsets of 60–120 s; voting window 2 minutes.
2. Report `reports/demo-full.md`: sections per scenario, every tx linked, entitlement tables, balances before/after, final `implemented vs simulated` table copied from docs/01-product.md.
3. `make demo` target; total runtime < 15 minutes; resilient to `BlockhashNotFound`/rate limits (retry with backoff, Helius RPC from .env).

## Acceptance criteria
- [ ] `make demo` succeeds twice in a row on devnet; `reports/demo-full.md` committed with links; Gate 1 declared in `reports/worklog/019.md`.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/019.md`, then print exactly `DONE:019` or `BLOCKED:019 <reason>`.
