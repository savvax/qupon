---
id: 1525
title: public holder lookup + featured series
agent: glm
tier: T1
depends_on: [1521]
verify: make verify
timeout_min: 180
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1525 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)

## Plan section
### Task 1525: public holder lookup + featured series

**Agent:** glm · **Depends on:** 1521 · **Role:** go-backend

`GET /holders/{owner}` (public, cached 15 s): positions per series (units, KYC status, payout route), entitlements with status/amounts/paid tx, upcoming payouts (next record/payment dates per series via the clock); `GET /series?featured=1`; featured ordering in `/series`. Tests + openapi. Commit `feat(registrar): holder lookup by address; featured series`. **Acceptance:** tests green; `make verify` green.

## Finish
`make verify` green, commits carry `task: 1525`, `reports/worklog/1525.md` written. Print `DONE:1525` or `BLOCKED:1525 <reason>`.
