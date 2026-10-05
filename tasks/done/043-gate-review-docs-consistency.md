---
id: 043
title: Consistency sweep: docs/02 vs code, README vs reports, implemented-vs-simulated vs reality
agent: claude
tier: T1
depends_on: [033]
verify: make verify
timeout_min: 30
---
## Goal
Catch drift before submission.

## Read first
- docs/
- README.md
- programs/qupon_bonds/src
- clients/ts/src/cli.ts

## Steps
1. Compare instruction names/args in `docs/02-architecture.md` with the IDL; compare CLI commands with the README; verify every link in README/TECHNICAL_OVERVIEW resolves (curl HEAD); verify the implemented-vs-simulated table matches what `make demo` actually does; file `9NN-fix-*` tasks for mismatches with precise locations.

## Acceptance criteria
- [ ] `reports/consistency-YYYY-MM-DD.md` lists checks and results; no unresolved mismatches before Gate 3.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/043.md`, then print exactly `DONE:043` or `BLOCKED:043 <reason>`.
