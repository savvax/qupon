---
id: 1531
title: guidance system — NowBar, tours, glossary, /learn
agent: glm
tier: T0
depends_on: [1530, 1504]
verify: make verify
timeout_min: 75
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1531 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/design/language.md (from 1530)
- apps/web/src/app/globals.css

## Plan section
### Task 1531: guidance system — NowBar, tours, glossary, /learn

**Agent:** glm · **Depends on:** 1530, 1504 · **Role:** frontend

- [ ] `NowBar` in `CabinetShell` and the sandbox: derives the next step from `src/lib/actionFlow.ts` (+ new statuses Defaulted/PaidToAgent), shows who may do it ("anyone can push this step" for permissionless steps), one primary button, countdown for time gates (demo-clock aware).
- [ ] Tours per role (issuer, registrar, investor, sandbox): 6–9 steps each, built on Radix Popover + `TourStep` (no new dependency), remembered per user in localStorage (try/catch), restart from the help menu.
- [ ] Glossary: `apps/web/src/lib/glossary.ts` (≥ 20 terms: record date, entitlement, ex-date, accrued interest/ЖКС/НКД, coupon, redemption, early/partial call, bondholder meeting, quorum, escrow, paying agent, registrar, default, cure, permissionless, snapshot hash, Token-2022 pause, DvP, SAS attestation, demo clock) with en/ru/kk plain-language definitions; `GlossaryTerm` wraps first occurrences on landing, bond, console, investor pages.
- [ ] `/learn` page: "How a bond lives on Qupon" plain-language walkthrough with the LifecycleRail and MoneyFlow primitives (en/ru/kk).
- [ ] Specs: `e2e/guidance.spec.ts` (NowBar shows the right step for each status fixture; tour opens/closes; glossary popover keyboard accessible).

**Acceptance:** spec green; Opus design score ≥ 8; `make verify` green.

## Finish
`make verify` green, commits carry `task: 1531`, `reports/worklog/1531.md` written. Print `DONE:1531` or `BLOCKED:1531 <reason>`.
