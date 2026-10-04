---
id: 039
title: Daily report generator (ops/nightly.sh hook): what merged, what failed, what is blocked, questions
agent: flash
tier: T1
depends_on: [001]
verify: make verify
timeout_min: 20
---
## Goal
Keep the human informed without reading logs.

## Read first
- ops/nightly.sh
- tasks/
- reports/worklog/

## Steps
1. `ops/daily-report.sh` collects `git log --since=24h`, tasks done/failed/blocked counts, HUMAN_TODO open items, last nightly demo status, and asks Flash (via `pi -p`) to write `reports/daily-YYYY-MM-DD.md` (≤ 200 words, bullet list, Russian OK) — the script must work even if pi is unavailable (plain text fallback).

## Acceptance criteria
- [ ] Running the script produces the report; nightly.sh calls it.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/039.md`, then print exactly `DONE:039` or `BLOCKED:039 <reason>`.
