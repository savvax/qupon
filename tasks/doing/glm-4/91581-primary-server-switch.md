---
id: 91581
title: the new server is primary — every public link, default and test points at it
agent: glm
tier: T1
depends_on: [1540]
verify: make verify
timeout_min: 90
---
## Goal
The submission now uses the new server: site **https://qupon.185-216-25-91.sslip.io**, API **https://api.185-216-25-91.sslip.io**
(ssh `user@185.216.25.91`, deployed with `COMPOSE=compose.shared.yml QUPON_DIR=/home/user/qupon`). The old server
(`85.192.29.7`, `*.85-192-29-7.sslip.io`) stays up as a fallback but must not be what a judge or a test is sent to.

## Do
- Replace the old hosts with the new ones in: `README.md`, `docs/SUBMISSION_FINAL.md`, `docs/VIDEO_SCRIPT.md`, `docs/TECHNICAL_OVERVIEW.md`
  (if present), `HUMAN_TODO.md` lines that tell where prod is, the plan/spec docs that describe the live URLs,
  `services/registrar/internal/kase/client.go` (User-Agent), `apps/web/playwright.config.ts` (comment).
  Find them all with `git grep -nE '85-192-29-7|85\.192\.29\.7'`. Leave historical run reports (`reports/live-*.md`,
  `reports/e2e-live.md`, `reports/worklog/*`, `reports/audit/*`, `tasks/*`) unchanged — they record what ran where.
- `apps/web/e2e/live/v2.spec.ts:22`: derive the API from `E2E_BASE_URL` (`qupon.` → `api.`) when `E2E_API_URL` is unset, so a live
  run never mixes servers; same for any other live spec with a hard-coded host.
- `ops/deploy-vps.sh`: default target `user@185.216.25.91` with `COMPOSE=compose.shared.yml` and `QUPON_DIR=/home/user/qupon` as the
  defaults for that target; the old box stays deployable with `COMPOSE=compose.yml QUPON_DIR=/opt/qupon ops/deploy-vps.sh root@85.192.29.7`
  — document both lines in the script header and in `deploy/vps/README.md`. Do not change what the script writes to the servers.
- `git grep` afterwards: the old host appears only in historical reports and in the documented fallback deploy line.

## Constraints
Docs/tests/defaults only; no behaviour change; never print secrets; do not deploy or ssh; never name other hackathon participants.

## Finish
Commit `docs: the new server is the primary deployment` (`task: 91581`), write `reports/worklog/91581.md` (3 lines), print
`DONE:91581` or `BLOCKED:91581 <reason>`.
