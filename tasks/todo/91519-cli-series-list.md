---
id: 91519
title: CLI series:list (every on-chain series) + hide-demo-series helper
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 90
---
## Goal
Dozens of throw-away demo series now live on devnet (every `make demo` run creates new ones). The final deploy (1540)
must hide all of them except the curated ones; today there is no way to list every series from the CLI.

## Read first
- clients/ts/src/commands/state.ts and series.ts (command style: JSON on stdout, logs on stderr), clients/ts/src/generated
  (Codama `getSeriesDecoder`, discriminator constants), config/hidden-series.txt (format: one mint per line, `#` comments)
- Note: a Series with `open_action = None` keeps a stale 32-byte tail — decode the prefix only; never require zero padding.

## Do
- `qupon series:list [--status active|closed|all] [--demo]` → `getProgramAccounts` filtered by the Series discriminator,
  decoded with Codama; prints `{ok, series:[{pda, mint, ticker, isin, status, daySecs, hookGate, actionCount, issueDate,
  maturityDate}]}` sorted by ticker.
- `ops/hide-demo-series.sh [--dry-run]`: runs `series:list`, keeps every mint that appears in `config/devnet.json`
  `series.*.mint` or in `config/featured-series.txt` (create it: one mint per line, empty for now with a header comment),
  and writes every other mint to `config/hidden-series.txt` (preserving its header comment, sorted, unique). `--dry-run`
  prints the diff only.
- Unit tests: the filter/sort logic in TS (vitest, no network); `bash -n` + shellcheck-clean script.

## Acceptance
`pnpm --filter @qupon/client test` green; `make verify` green. Do not run the script against devnet in this task (1540
does). Commit `feat(cli): series:list and a hide-demo-series helper` (`task: 91519`).

## Finish
Write `reports/worklog/91519.md` (3–6 lines), commit with `task: 91519`, print `DONE:91519` or `BLOCKED:91519 <reason>`.
