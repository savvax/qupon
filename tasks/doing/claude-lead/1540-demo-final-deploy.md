---
id: 1540
title: final devnet run, live e2e, deploy (Opus)
agent: claude
tier: T0
depends_on: [1519, 1520, 1521, 1522, 1523, 1524, 1525, 1526, 1537]
verify: make verify
timeout_min: 240
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1540 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)

## Plan section
### Task 1540: final devnet run, live e2e, deploy (Opus)

**Agent:** claude (Opus) · **Depends on:** 1519, 1520–1537

`make deploy` if the program changed since 1519 (+ verified build + IDL); `make demo`, `make demo-trade`, a sandbox run end-to-end on devnet; `proof:verify reports/devnet-proof*.json` all ✓; `ops/deploy-vps.sh` (+ `REINDEX=1`); live e2e (`E2E_BASE_URL=…`) incl. a new `e2e/live/sandbox.spec.ts`; static proof export built. **Code freeze Oct 12 12:00.**

## Lead notes (2026-10-10 19:40)
- Production registrar runs WITHOUT the scheduler: it logs "sandbox API enabled but the scheduler is off: a sandbox never
  advances past its first step". For the live sandbox and the showcase series set `SCHEDULER=1` (and decide on
  `DEMO_SPEED`/autofund) in `/opt/qupon/registrar.env` — the autopilot then acts on every series where the registrar is
  operator; check what it would do first with `SCHEDULER_DRY_RUN=1` and the logs.
- Migration 008 rebuilt `users` on production at 19:34 (prod DB backup: `/data/backup-20261010/registrar.db`; users 5,
  wallets 1, sessions 2 before and after).
- `ops/deploy-vps.sh` rsync drops often ("Connection closed by remote host"): retry, or rsync only the changed service
  and run `docker compose build <svc>` detached on the server (`nohup setsid …`).

## Finish
`make verify` green, commits carry `task: 1540`, `reports/worklog/1540.md` written. Print `DONE:1540` or `BLOCKED:1540 <reason>`.
