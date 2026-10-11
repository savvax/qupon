---
id: 91555
title: seed-showcase re-seeds when the on-chain series is closed or on another clock
agent: flash
tier: T1
depends_on: [91553]
verify: make verify
timeout_min: 120
---
## Goal
`make seed-showcase` skips a definition whenever ANY on-chain series has its ISIN (`series:list` defaults to `--status all`).
The first showcase ran on a 4 s clock and is now Closed (3 of 4) or still Active on the old clock (Aktobe Mining), so
re-seeding on the new 3600 s clock (task 91553) creates nothing.

## Read first
- clients/ts/scripts/seed-showcase.ts (`existing` set built from `series:list`, `buildShowcasePlan`), its plan test,
  clients/ts/src/commands/series.ts (`series:list` output: pda, mint, ticker, isin, status, daySecs, …).

## Do
- Skip a definition only if an on-chain series with the same ISIN is **Active** AND has the same `daySecs` as the
  definition; otherwise plan it fresh (a closed or other-clock series does not count).
- The mints written to `config/featured-series.txt` are the ones of the matching active series (new or skipped); remove
  from that file any mint that no longer matches a definition (the old showcase), so the board features only the new ones.
- Unit-test the matching rule (closed → re-seed, active on other clock → re-seed, active same clock → skip). No network.
- Do NOT run it against devnet (the lead does).

## Acceptance
`pnpm --filter @qupon/client test` green; `make verify` green. Commit `fix(demo): seed-showcase re-seeds closed or
other-clock showcase series` (`task: 91555`).

## Finish
Write `reports/worklog/91555.md` (3–6 lines), commit with `task: 91555`, print `DONE:91555` or `BLOCKED:91555 <reason>`.
