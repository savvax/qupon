---
id: 1535
title: bond dossier v2 + board
agent: glm
tier: T1
depends_on: [1530, 1502, 1525]
verify: make verify
timeout_min: 90
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1535 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/design/language.md (from 1530)
- apps/web/src/app/globals.css

## Plan section
### Task 1535: bond dossier v2 + board

**Agent:** glm · **Depends on:** 1530, 1502, 1525 · **Role:** frontend

- [ ] `/bonds/[mint]` per golden screen: header with status incl. IN DEFAULT / DEMO CLOCK, yield block (clean, accrued, dirty, YTM, current yield), LifecycleRail of all actions, schedule, terms, KASE panel and documents moved below the life story, trade ticket preview showing accrued split for N bonds.
- [ ] Register "as of record date": one tab per action, with share bars and a per-holder calculation drawer (30E/360 days, gross, tax, net, principal, formula line `units × per-unit = amount`). Journal of every operation with explorer links. "Export issue audit (CSV)" builds the CSV client-side from the API data.
- [ ] `/bonds`: featured first, sandboxes hidden, human titles, empty/error states. Statuses show the life stage ("Record date soon", "Paying", "Voting", "Redeemed", "In default").
- [ ] Curated showcase: `services/registrar` admin seeds 4 featured demo series, one per scenario (coupon, redemption, meeting, early call), each with a distinct ticker, a human name and an ISIN of the form `KZ2C0QPN000N`. The data is created by 1540 on devnet; this task only ships the config/seed code and the board ordering.

**Acceptance:** specs green; Opus design score ≥ 8.

## Finish
`make verify` green, commits carry `task: 1535`, `reports/worklog/1535.md` written. Print `DONE:1535` or `BLOCKED:1535 <reason>`.
