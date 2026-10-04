---
id: 016
title: make demo-coupon: scripted INTR flow on devnet with explorer links in reports/demo-coupon.md
agent: glm
tier: T0
depends_on: [013, 014]
verify: make verify
timeout_min: 45
---
## Goal
First end-to-end proof on devnet; the report doubles as material for the technical overview.

## Read first
- clients/ts/src/cli.ts
- docs/01-product.md (S0, S1)

## Steps
1. `clients/ts/scripts/demo-coupon.ts`: creates (or reuses) the QPNb1 mint + series, registers 3 investors (+ shows the outsider failing), subscribes 10/25/65 units via DvP, announces INTR with record_at = now + 90 s and payment_at = now + 120 s (period dates realistic: 2026-07-03 → 2027-01-03 for the math, accrual_days 180 — document that the demo compresses real time), waits, strikes, snapshots, finalizes, funds, pays, completes; after every tx appends a markdown row (step, signature link, slot, status) to `reports/demo-coupon.md`; final section prints entitlements table (owner, units, gross, tax, net) and balances before/after.
2. Fails loudly with the failing step and tx logs if anything breaks (`getTransaction` with `jsonParsed` logs).

## Acceptance criteria
- [ ] `make demo-coupon` completes on devnet and `reports/demo-coupon.md` shows 500.00 / 1,250.00 / 3,250.00 tKZT paid with 9+ explorer links.
- [ ] Re-running the script creates a fresh series (suffix with timestamp) rather than failing.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/016.md`, then print exactly `DONE:016` or `BLOCKED:016 <reason>`.
