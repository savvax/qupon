---
id: 054
title: config/demo.json: scenario parameters for the devnet demos (series, investors, offsets, votes)
agent: flash
tier: T0
depends_on: [002]
verify: make verify
timeout_min: 20
---
## Goal
One JSON drives both demo scripts and the UI seed, so the human can tune the demo without code changes.

## Read first
- docs/01-product.md (S0–S4)
- config/devnet.json

## Steps
1. `config/demo.json`: series QPNb1 (tKZT) and BTRKdemo (USDC) with realistic civil dates for the math (period 2026-07-03→2027-01-03 etc.), real-time offsets (`recordAtOffsetSec: 90`, `paymentAtOffsetSec: 120`, `votingWindowSec: 120`), investors (units 10/25/65, types, tax bps), vote plan (65 For / 25 Against / 10 Abstain), MCAL call date (47 accrued days), prices for DvP; JSON schema in `config/demo.schema.json`; a vitest that validates the file.

## Acceptance criteria
- [ ] File + schema + test present; demo scripts (016/019) must read it.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/054.md`, then print exactly `DONE:054` or `BLOCKED:054 <reason>`.
