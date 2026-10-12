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

## Review feedback (round 1, 2026-10-12 09:41) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Verdict: fail, on one point. The README tells a fresh-clone user that mock mode is the default for `pnpm dev`, but it is not: they must copy .env.example to .env.local or set API_MOCKING. The other fixes are sound. Doctor and bootstrap read the Go pin from go.mod, bootstrap runs agave-install init, and the e2e fixes update stale copy to the shipped messages without weakening assertions. I ran no tests and took no screenshots, because no app UI code changed.

### Blocking
- README.md:191 — The README block says `pnpm dev  # mock mode is the default in dev`. That's false. `apps/web/src/lib/api.ts:32-35` turns mock on only when NODE_ENV=development AND (API_MOCKING or NEXT_PUBLIC_API_MOCKING) == "enabled". No committed .env.development or next.config sets these, and the `dev` script is plain `next dev`. On a fresh clone, `pnpm dev` therefore calls the real registrar at http://localhost:8080 and fails. That misses the A91569-6 requirement to start the web in mock mode. Only `pnpm e2e` works, because playwright.config.ts sets the env itself.
  **Fix:** In the README mock-mode block, add `cp .env.example .env.local   # mock-mode vars` before `pnpm dev`. Change the `pnpm dev` comment to `# mock mode via .env.local → http://localhost:3000`. Alternatively, use the one-liner `API_MOCKING=enabled NEXT_PUBLIC_API_MOCKING=enabled pnpm dev`. Touch only these lines.

### Acceptance criteria not met
- A91569-6: README 'UI without keys (mock mode)' block: playwright install, start web in mock mode, run e2e — The block exists, but its `pnpm dev` step does not start mock mode on a fresh clone because no env is set (see blocking).

Design score: 8/10
