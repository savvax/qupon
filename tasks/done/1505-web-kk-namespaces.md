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

## Addendum (lead, after 1504 + 1530 merged)
- `apps/web/messages/kk.json` is missing 69 base keys that the design task 1530 added after 1504 was written (`bond.register.*`, `bond.now.*`, `bond.yield.*`, `bond.journal.*`, `bond.rail.*`, `action.now.*`, `nav.view.*`, `nav.sandbox`, `landing.flow.*`, `landing.simulated.*`, `bond.kpi.*`, `bond.money.*`). Translate all of them (list: keys of en.json not in kk.json).
- New namespaces from 1530: `kit`, `sandbox` — translate them with the others.
- Make `src/i18n/messages.test.ts` strict for the base file too: `keys(kk) == keys(en)` with no EN fallback, so a future en-only key fails the gate.
- Acceptance adds: `bash ops/shots.sh <dir> / /bonds/<mock mint> /registrar/actions/<mock pda> /sandbox/demo` in kk shows no English except brand names, tickers and `SIMULATED`.
