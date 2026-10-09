---
id: 1534
title: registrar console v2
agent: glm
tier: T1
depends_on: [1530, 1522, 1523]
verify: make verify
timeout_min: 90
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1534 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/design/language.md (from 1530)
- apps/web/src/app/globals.css

## Plan section
### Task 1534: registrar console v2

**Agent:** glm · **Depends on:** 1530, 1522, 1523 · **Role:** frontend

- [ ] Console per golden screen: an ActionFlow stepper (Announced → Record → Snapshot → Funded → Paid N/N → Reported). Each step shows its time and tx, and the seev.031/seev.036 download buttons sit on the step they belong to. The stepper also shows planned vs effective record time (from `StrikeTiming`), permissionless badges, Defaulted state (shortfall, overdue timer, "declare default" button for anyone, cure by funding), bank confirmations panel (PaidToAgent rows → confirm with reference), disclosure hash panel (fetch seev031, sha256 in the browser, compare with `disclosureHash` → ✓/✗), reconcile panel showing scheme 0/1.
- [ ] Registrar dashboard: replace the empty pipeline with a dense board (status columns that never truncate tickers at 1440/390) + alerts for overdue funding and pending bank confirmations.

**Acceptance:** specs green; Opus design score ≥ 8.

## Lead notes (after 1512–1515, 1519, 1531)
- `declare_default` exists on-chain since 1512 (permissionless; due at `max(payment_at, record_at + finalize_delay) + one series day`, see docs/02-architecture.md "Security review of the plan-15 wave"). 1531 deliberately left it out of `apps/web/src/lib/actionFlow.ts` `nextStep`; add it as a real step (actor "anyone") once the API exposes `defaultedAt`/`inDefault` (1521/1522), with a test in `actionFlow.test.ts`.
- `confirm_bank` is already a StepId (1531); wire it to `payout:confirm-bank` through the API (1522).

## Finish
`make verify` green, commits carry `task: 1534`, `reports/worklog/1534.md` written. Print `DONE:1534` or `BLOCKED:1534 <reason>`.
