---
id: 1505
title: Kazakh locale — namespace files
agent: glm
tier: T1
depends_on: [1504]
verify: make verify
timeout_min: 60
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1505 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/design/language.md (from 1530)
- apps/web/src/app/globals.css

## Plan section
### Task 1505: Kazakh locale — namespace files

**Agent:** glm · **Depends on:** 1504 · **Role:** frontend

Translate every `apps/web/messages/en/<ns>.json` into `messages/kk/<ns>.json` (admin, account, kyc, notify, org, reports, kase, assets, network, wallet, onboarding, trades, termsheet + any namespace added since); empty `KK_PENDING`; same terminology table as 1504. **Acceptance:** `messages.test.ts` passes with `KK_PENDING = []`; `bash ops/shots.sh <dir> /investor /registrar /admin /account` in kk shows no English strings except brand names and `SIMULATED`; `make verify` green.

## Finish
`make verify` green, commits carry `task: 1505`, `reports/worklog/1505.md` written. Print `DONE:1505` or `BLOCKED:1505 <reason>`.
