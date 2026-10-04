---
id: 011
title: fund_action, pay_batch (cash + tax vault), complete_action (resume, schedule advance)
agent: claude
tier: T0
depends_on: [010]
verify: make verify
timeout_min: 60
---
## Goal
Settlement: pre-funded escrow, batched payouts, reconciliation and resume.

## Read first
- docs/02-architecture.md (instructions 11–13)
- docs/03-domain.md (§1 CSD rules, §2 payout)

## Steps
1. `fund_action(amount)`: issuer or paying_agent; status SnapshotComplete/Funded; `transfer_checked` to escrow; if escrow ≥ total_net + total_tax → Funded. Emit `ActionFunded`.
2. `pay_batch`: pairs/triples [Entitlement, Investor, holder cash ATA] max 10; status Funded/Settling; for Snapshotted entitlements: transfer `net + principal` escrow→holder (action PDA signer), `tax` escrow→tax_vault; status Paid; counters; status Settling. Emit `EntitlementPaid` with gross/tax/net/principal.
3. `complete_action`: counts match, `total_paid == total_net + Σprincipal`; INTR → CPI `resume`, `Series.period_start = period_end`, `next_coupon_date += period`, clear `open_action`, status Completed; redemption kinds → CPI `resume`, status Retiring, `Series.status = Retiring`. Emit `ActionCompleted`.
4. Tests: brief end-to-end (announce → strike → snapshot → finalize → fund 5,000.00 tKZT → pay → complete): investors' cash balances +500.00/+1,250.00/+3,250.00, escrow 0, mint resumed (a transfer succeeds afterwards), `next_coupon_date` advanced; underfunded pay fails with `Underfunded`; complete before all paid fails; tax vault receives 10% when an investor has tax_bps 1000.

## Acceptance criteria
- [ ] Tests green; the brief's example is asserted literally (50_000 / 125_000 / 325_000 minor units).

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/011.md`, then print exactly `DONE:011` or `BLOCKED:011 <reason>`.
