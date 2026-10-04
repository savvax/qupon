---
id: 009
title: announce_action (all kinds, server-side calc verified on-chain) and cancel_action
agent: claude
tier: T0
depends_on: [007]
verify: make verify
timeout_min: 60
---
## Goal
Create corporate actions with ISO-shaped fields and on-chain verification of the entitlement parameters.

## Read first
- docs/02-architecture.md (instruction 6, 7; CorporateAction layout)
- docs/03-domain.md (§3 day count via civil dates, §5 state machine, §6 ISO fields)

## Steps
1. `announce_action(args: AnnounceArgs{kind, mandatory, corp_id, official_id, record_at, payment_at, period_start_ymd, period_end_ymd, period_start_ts, period_end_ts, accrual_days, rate_bps, proposal_new_rate_bps, proposal_new_maturity, voting_ends_at, quorum_bps, approval_bps})`: signer registrar for INTR/REDM/MCAL/PCAL, issuer for BMET; checks: series Active; no open action (track `Series.open_action: Option<Pubkey>` — add the field, update the doc); dates ordered; `accrual_days == entitlement::accrual_days(dc, start_ymd, end_ymd)` else `EntitlementCalcMismatch`; for INTR `period_start_ts == Series.period_start`; computes `per_unit_gross` and `per_unit_principal`; creates escrow ATA (authority = action PDA) for the cash mint; `Series.action_count += 1`. Emit `ActionAnnounced` with every ISO-relevant field.
2. `cancel_action`: registrar; status Announced only; clears `open_action`. Emit `ActionCancelled`.
3. Tests: INTR announce happy path with the brief's numbers (per_unit_gross == 5000); wrong accrual_days → EntitlementCalcMismatch; second open action → ActionAlreadyOpen; cancel then announce again works; BMET announce by issuer with proposal.

## Acceptance criteria
- [ ] Tests green; `docs/02-architecture.md` updated with `open_action` field.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/009.md`, then print exactly `DONE:009` or `BLOCKED:009 <reason>`.
