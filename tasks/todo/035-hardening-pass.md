---
id: 035
title: Security/edge hardening of the program: authorities, overflow, status guards, batch limits, clippy pedantic
agent: claude
tier: T1
depends_on: [015, 017]
verify: make verify
timeout_min: 60
---
## Goal
Make the program defensible under a judge's code review and a quick audit.

## Read first
- programs/qupon_bonds
- docs/02-architecture.md (errors)

## Steps
1. Checklist: every instruction checks the right signer against Series fields; PDA bumps stored and reused; `remaining_accounts` ownership/mint/owner checks; no arithmetic without checked ops; batch limits enforced; status transitions exhaustive (match with no wildcard); clock comparisons use `>=`/`<` consistently; metadata update authority handling documented; `close_series` cannot be called twice; events emitted on every transition.
2. Add tests for each new guard; run `cargo clippy --all-targets -- -W clippy::pedantic` and fix what is reasonable.
3. Write `docs/SECURITY_NOTES.md` (threats considered, out-of-scope, what an audit should look at).

## Acceptance criteria
- [ ] Tests green; `docs/SECURITY_NOTES.md` exists; no `unwrap()`/`expect()` in instruction handlers.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/035.md`, then print exactly `DONE:035` or `BLOCKED:035 <reason>`.
