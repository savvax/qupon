---
id: 91577
title: fresh clone works as the README says (doctor, bootstrap, mock e2e)
agent: glm
tier: T1
depends_on: [91569]
verify: make verify
timeout_min: 150
---
## Goal
Fix findings A91569-1, -2, -4, -5, -6 of `reports/audit/fresh-clone.md` (read it first — it has the commands and outputs).

## Do
- A91569-1: `make doctor` Go check expects 1.25 while the repo pins 1.26 — check the pinned versions from their one source
  (go.mod / mise / toolchain files), never a second hard-coded copy.
- A91569-4: `ops/bootstrap.sh` installs Agave 4.3.0 but does not repoint `active_release` — make it idempotent
  (`agave-install init <version>` or the documented equivalent) so doctor passes after bootstrap on a machine with an older Agave.
- A91569-2: the mock e2e suite fails 9/156 specs on a fresh clone — reproduce in a fresh clone (`git clone "$PWD" /tmp/qupon-fc-91577`,
  no node_modules/.next from the main checkout), find each root cause (stale expectation after recent UI/text changes, ordering,
  missing env, flaky wait) and fix the cause; never delete or weaken an assertion — if a spec encodes outdated copy, update the
  expectation to the current shipped copy and say so in the worklog. Run the suite twice green.
- A91569-5/-6: add `apps/web/.env.example` (no secrets; the mock-mode variables) and a short "UI without keys (mock mode)" block in
  README: install Playwright browsers (`pnpm exec playwright install chromium`), start the web in mock mode, run the mock e2e suite.
  Touch only those README lines (task 91573 edits other README sections in parallel).
- Delete the temp clone at the end.

## Constraints
Pre-submission (code freeze 2026-10-12 12:00 Almaty); smallest safe change; never weaken a test; no secrets; do not deploy; never
name other hackathon participants.

## Finish
Commit with `task: 91577`, write `reports/worklog/91577.md` (3–6 lines), print `DONE:91577` or `BLOCKED:91577 <reason>`.
