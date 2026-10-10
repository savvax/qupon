---
id: 91542
title: seed-showcase: create the four curated demo series on devnet
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 180
---
## Goal
Task 1535 defined the public board's four curated series (`services/registrar/internal/api/showcase.go`, one per
scenario: coupon, redemption, meeting, early call; demo clock; ISIN KZ2C0QPN000N). Task 1540 must create them on devnet
in one command.

## Read first
- services/registrar/internal/api/showcase.go (+ its seed endpoint and tests), clients/ts/scripts/demo-plan15.ts and
  demo-full.ts (how a series is created and driven through the CLI: `series:create --demo-day-secs`, `kyc:attest`,
  `investor:register`, `subscribe`, `action:announce`, crank commands, `meeting:announce`, `vote`), config/featured-series.txt,
  ops/hide-demo-series.sh (task 91519).

## Do
- Share the definitions instead of copying them: export them as `config/showcase.json` (generated from the Go table by
  a Go test with `EXPORT_SHOWCASE=1`, and asserted equal otherwise), read by the TS script.
- `clients/ts/scripts/seed-showcase.ts` + `make seed-showcase`: for each definition create the series with its demo
  clock, register + subscribe the three demo investors 10 / 25 / 65, and drive it to a state that makes its dossier
  meaningful: coupon → first coupon paid; redemption → redeemed and closed; meeting → voting open with two votes cast;
  early call → MCAL announced. Append the mints to `config/featured-series.txt`, then call the registrar's showcase
  seed endpoint if `QUPON_API_URL` + `ADMIN_TOKEN` are set (print the curl otherwise). Idempotent: a definition whose
  ISIN already exists on-chain is skipped (use `series:list`). Writes `reports/showcase.md` with explorer links.
- `--dry-run` prints the plan without network; unit-test the plan builder (no network).
- Do NOT run it against devnet in this task (1540 does).

## Acceptance
Dry-run test green; `make verify` green. Commit `feat(demo): seed the curated showcase series` (`task: 91542`).

## Finish
Write `reports/worklog/91542.md` (3–6 lines), commit with `task: 91542`, print `DONE:91542` or `BLOCKED:91542 <reason>`.
