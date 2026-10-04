---
id: 040
title: T2: Squads v4 vault as issuer/paying-agent authority for fund_action
agent: claude
tier: T2
depends_on: [019]
verify: make verify
timeout_min: 60
---
## Goal
Optional: show institutional approval — funding requires a 2-of-3 Squads vault.

## Read first
- docs/04-stack.md (Squads)
- https://github.com/Squads-Protocol/v4

## Steps
1. Create a devnet multisig with `@sqds/multisig` (registrar + issuer + paying agent, threshold 2); make the vault the issuer pubkey of a demo series; `fund_action` executed through `vaultTransactionCreate/proposalApprove/execute`; UI shows pending approvals (link to Squads devnet UI).

## Acceptance criteria
- [ ] Demo of a funded coupon via the vault recorded in reports; README roadmap updated. Skip entirely if Gate 2 is not met.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/040.md`, then print exactly `DONE:040` or `BLOCKED:040 <reason>`.
