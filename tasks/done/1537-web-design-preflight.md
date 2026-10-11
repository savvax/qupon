---
id: 1537
title: design pre-flight (Opus)
agent: claude
tier: T0
depends_on: [1531, 1532, 1533, 1534, 1535, 1536]
verify: make verify
timeout_min: 240
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1537 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/design/language.md (from 1530)
- apps/web/src/app/globals.css

## Plan section
### Task 1537: design pre-flight (Opus)

**Agent:** claude (Opus) · **Depends on:** 1531–1536

Full sweep (`e2e/sweep.spec.ts` extended to kk) every route × en/ru/kk × 1440/390; fix every inconsistency (spacing, truncation, token drift, empty states, motion); write `reports/design/preflight.md` with before/after.

## Finish
`make verify` green, commits carry `task: 1537`, `reports/worklog/1537.md` written. Print `DONE:1537` or `BLOCKED:1537 <reason>`.
