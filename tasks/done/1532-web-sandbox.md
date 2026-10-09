---
id: 1532
title: sandbox UI
agent: claude
tier: T0
depends_on: [1530, 1531]
verify: make verify
timeout_min: 90
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1532 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/design/language.md (from 1530)
- apps/web/src/app/globals.css

## Plan section
### Task 1532: sandbox UI

**Agent:** glm · **Depends on:** 1530, 1531, 1524 (mock until merged) · **Role:** frontend

- [ ] Landing CTA "Try it in 3 minutes" → `POST /api/bo/demo/sandbox` (allowlist) → `/sandbox/[id]`.
- [ ] `/sandbox/[id]`: golden layout from 1530 — demo-clock badge + live countdowns, LifecycleRail with the bond's whole life, NowBar, role switcher (issuer / registrar / investor / "anyone"), live tx feed (every tx with explorer link), entitlement table that fills as snapshot runs, MoneyFlow during payment, scenario buttons (Skip funding → default; Cure; Try sending to a non-KYC wallet; Trade 5 bonds with accrued) each explaining the on-chain result in one line + link.
- [ ] Optional "Use my wallet": connect → included as a fourth holder (via `POST /demo/sandbox {wallet}`), Claim button works with the real wallet.
- [ ] Spec `e2e/sandbox.spec.ts` on mocks (state machine fixtures for every status).

**Acceptance:** spec green; shots at 1440/390 en/ru/kk; Opus design score ≥ 8.

## Finish
`make verify` green, commits carry `task: 1532`, `reports/worklog/1532.md` written. Print `DONE:1532` or `BLOCKED:1532 <reason>`.
