---
id: 1541
title: uptime watchdog
agent: flash
tier: T1
depends_on: []
verify: make verify
timeout_min: 180
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1541 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)

## Plan section
### Task 1541: uptime watchdog

**Agent:** flash · **Depends on:** —

`ops/watchdog.sh` (cron-able): checks `PUBLIC_URL`, `/healthz`, `/admin/system` RPC/operator balances (token from env), posts to Telegram if `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` are set, otherwise prints; exits non-zero on failure; README line in `deploy/vps/README.md`. **Acceptance:** `bash ops/watchdog.sh --dry-run` prints the checks; shellcheck clean.

## Finish
`make verify` green, commits carry `task: 1541`, `reports/worklog/1541.md` written. Print `DONE:1541` or `BLOCKED:1541 <reason>`.
