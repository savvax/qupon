---
id: 91559
title: live e2e test series (ticker E2E-…) never reach the public board
agent: flash
tier: T1
depends_on: []
verify: make verify
timeout_min: 60
---
## Goal
`apps/web/e2e/live/series.spec.ts` issues a real devnet series named `E2E-<stamp>` on every live run; production's public
board (GET /series) now lists 7 of them right after the curated showcase. The ticker prefix `E2E-` is reserved for
automated tests: the board self-curation (task 91558, `SHOWCASE_AUTOSEED` loop in services/registrar) must hide them.

## Read first
services/registrar/internal/api/showcase.go (the exported seed function from 91558 + its test), cmd/registrar/main.go
(autoseed loop).

## Do
- In the seed function, add every series whose ticker starts with `E2E-` to the hidden set (same "hide unless an admin
  already featured it" semantics the function uses for uncurated demo-clock series). Real-clock and demo-clock alike.
- Extend the existing showcase seed test with one `E2E-…` real-clock series that must come out hidden and off GET /series.
- One comment line in apps/web/e2e/live/series.spec.ts next to the name: the prefix keeps it off the public board.

## Acceptance
Go test green; `make verify` green. Commit `fix(registrar): hide live e2e series from the public board` (`task: 91559`).
Do NOT deploy.

## Finish
Write `reports/worklog/91559.md` (3–6 lines), commit with `task: 91559`, print `DONE:91559` or `BLOCKED:91559 <reason>`.
