---
id: 018
title: CLI commands for redemption, retire, close, meeting (announce-meeting, vote, finalize, apply) and MCAL
agent: glm
tier: T0
depends_on: [013, 015, 017]
verify: make verify
timeout_min: 45
---
## Goal
Extend the CLI so every instruction is reachable from scripts and the Go executor.

## Read first
- clients/ts/src/cli.ts
- docs/02-architecture.md

## Steps
1. Commands: `action:announce --kind REDM|MCAL|PCAL` (with `--call-date`, `--factor-bps`), `action:retire` (batches of 12), `series:close`, `meeting:announce --new-rate-bps --voting-minutes --quorum-bps --approval-bps`, `vote --choice for|against|abstain --keypair <investor>`, `meeting:finalize`, `meeting:apply`.
2. `state:dump` includes votes and retirement counters; `explorer` prints links for series, action, entitlements.

## Acceptance criteria
- [ ] All new commands run on devnet manually; unit tests for argument parsing; `pnpm typecheck` green.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/018.md`, then print exactly `DONE:018` or `BLOCKED:018 <reason>`.
