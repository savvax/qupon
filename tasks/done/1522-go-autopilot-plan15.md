---
id: 1522
title: Go executor + scheduler for plan 15
agent: claude
tier: T0
depends_on: [1521]
verify: make verify
timeout_min: 75
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1522 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)

## Plan section
### Task 1522: Go executor + scheduler for plan 15

**Agent:** glm · **Depends on:** 1521 · **Role:** go-backend

**Files:** `internal/executor/executor.go` (`NextStep`: status 10 → `fund` only with autofund else none; `PaidToAgent` pending → step `confirm_bank` for registrar/paying-agent operator UI, never automatic; `cliCommand` entries for `default`, `confirm-bank`, `claim`), `internal/scheduler/scheduler.go` (hooked series: snapshot from `record_at` (no strike); legacy: strike at `record_at`; when SnapshotComplete and `now ≥ payment_at + grace` and not autofund → `default`; demo-clock series ticks every 2 s; scenario flag per series `no_autofund` read from `series_settings`), migrations `007_series_scenario.sql` (`series_settings.no_autofund INTEGER NOT NULL DEFAULT 0`, `series_settings.sandbox_id TEXT`), tests with the fake CLI.
- [ ] Table tests: every status × (autofund on/off) × (real/demo) → expected step and time gate.
- [ ] Commit `feat(registrar): autopilot for default/cure, early strike, demo-clock ticks`.

**Acceptance:** tests green; a dry-run tick log for a demo series shows strike → snapshot → finalize → (default) → fund → pay → complete; `make verify` green.

## Finish
`make verify` green, commits carry `task: 1522`, `reports/worklog/1522.md` written. Print `DONE:1522` or `BLOCKED:1522 <reason>`.
