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

## Review feedback (round 1, 2026-10-11 05:52) — fix every blocking item first; your previous work is already committed on this branch

### Summary
The skip rule is right for one row per ISIN, and the featured file is now rewritten instead of appended to. But series PDAs are per mint, so after a re-seed each showcase ISIN has an old row and a new row. The ISIN-keyed Map keeps whichever row sorts last by PDA. Later runs can therefore re-seed again (not idempotent) and write the old mint to featured-series.txt. Group the rows by ISIN and pick the active same-clock row explicitly.

### Blocking
- clients/ts/scripts/seed-showcase.ts:271 — `rows` is a Map keyed by ISIN built from every series:list row, so when an ISIN has several series the last row wins. Series PDAs are seeded by mint, so a re-seed leaves the old closed or 4 s series and the new 3600 s series sharing an ISIN and ticker. series:list sorts by ticker with a PDA tiebreak, so which row wins is effectively random, not creation order (the worklog's 'new series are created later so they win' is wrong). Two acceptance-level failures follow. (a) The skip rule breaks: on a second run, if the old closed or other-clock row sorts after the new active one, the definition is re-seeded again, creating a duplicate series every run. (b) Lines 304-308 have the same last-wins problem when they rebuild mintOf after the run, so config/featured-series.txt can get the OLD mint. The task requires 'mints written ... are the ones of the matching active series'.
  **Fix:** Pick the matching series per ISIN instead of last-wins. In buildShowcasePlan, make `existing` a ReadonlyMap<string, readonly {status,daySecs,mint}[]> (or a flat array) and set skip = rows.some(r => r.status === 'active' && r.daySecs === def.daySecs). In seed-showcase.ts, build that map by grouping rows by ISIN. For mint selection (skipped rows and the post-run re-list) use a helper matchingMint(rows, def) that returns the mint of the row with status 'active' and daySecs === def.daySecs, and throw if there is none or more than one. Use it in place of mintOf at lines 290 and 308. Add a unit test: an ISIN with two rows [active@3600 (new), closed@4 (old)] in both orders → skip is true and the matched mint is the active@3600 one.

### Acceptance criteria not met
- Skip only if an on-chain series with the same ISIN is Active AND has the definition's daySecs — The rule is correct for a single row per ISIN (showcasePlan.ts:321-325). seed-showcase.ts:271 collapses multiple rows per ISIN last-wins, ordered by PDA. After the first re-seed every showcase ISIN has 2+ rows, so the rule can see the closed row and re-seed again.
- featured-series.txt holds the mints of the matching active series; stale mints removed — featureMints now rewrites the file, which removes stale mints. But the mints come from mintOf, filled last-wins from series:list (lines 307-308), so an old closed mint can be written instead of the new one.

Design score: 0/10
