---
id: 1550
title: PCAL by quantity (KASE methodology) with verifiable largest remainder
agent: glm
tier: T2
depends_on: [1515]
verify: make verify
timeout_min: 90
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1550 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/02-architecture.md
- docs/03-domain.md
- programs/qupon_bonds/tests/common/mod.rs
- programs/qupon_bonds/tests/hook.rs (transfer-hook gate, spike 1509)

## Plan section
### Task 1550: PCAL by quantity (KASE methodology) with verifiable largest remainder
Pro-rata units redeemed per holder `floor(units × q / supply)`, leftover `k` assigned to the `k` largest remainders (ties by owner key) — the registrar supplies the threshold remainder and tie key; the program verifies during snapshot that counts above/at the threshold bracket `k` and that Σ redeemed == target. Tests with 10/25/65 and a 7-unit call.

## Finish
`make verify` green, commits carry `task: 1550`, `reports/worklog/1550.md` written. Print `DONE:1550` or `BLOCKED:1550 <reason>`.
