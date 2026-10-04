---
id: 030
title: Action page: status timeline, entitlements, tx links, downloads; console buttons via POST /advance
agent: glm
tier: T1
depends_on: [029, 023, 025, 026]
verify: make verify
timeout_min: 60
---
## Goal
The screen the judges will watch: one corporate action from announcement to completion with every proof one click away.

## Read first
- docs/01-product.md (demo storyboard)
- docs/02-architecture.md (Web app)

## Steps
1. `/actions/[pda]`: header (kind badge INTR/REDM/MCAL/BMET, ISO ids, mandatory/voluntary), vertical status timeline with per-step signature + explorer link + timestamp, next-step button (`Strike record date`, `Snapshot holders`, `Finalize`, `Fund escrow (issuer)`, `Pay holders`, `Complete`, `Retire tokens`, `Close series`, `Finalize meeting`, `Apply terms change (ARDFM registration — SIMULATED)`) calling `POST /advance` with optimistic polling; entitlement table (owner, units, gross, tax, net, principal, status, paid tx); reconcile panel (`GET /reconcile` → ok/mismatch, hashes); downloads: seev.031, seev.036 (per row + zip), KASE notice (EN/RU) with copy button; funding panel showing escrow balance vs required.
2. Error UX: CLI/API errors shown inline with the on-chain error name and a one-line explanation (map from `docs/02-architecture.md` errors).
3. Meeting view: proposal (old → new rate), tally bars, quorum/approval thresholds, voting countdown.

## Acceptance criteria
- [ ] A human can run the whole coupon flow from the UI without a terminal (Gate 2 evidence: screenshots in `reports/ui-walkthrough.md`).

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/030.md`, then print exactly `DONE:030` or `BLOCKED:030 <reason>`.
