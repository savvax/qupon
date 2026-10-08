---
id: 1410
title: CLI pay_batch recreates closed holder cash ATAs idempotently
agent: glm
tier: T1
depends_on: [1408]
verify: make verify
timeout_min: 45
---
## Goal
A holder who closes their empty cash ATA during Funded makes `pay_batch` fail for them, `complete_action` is blocked and the mint stays paused for everyone (settle.rs ~L156-160). In `clients/ts/src/commands/action.ts` pay, prepend `createAssociatedTokenAccountIdempotent` (Token-2022/legacy per cash mint program) for each holder in the batch.

## Acceptance criteria
- Test (TS unit with instruction inspection, or LiteSVM if a harness exists): batch instructions include the idempotent create per holder; a closed ATA case pays successfully.
- `make verify` green; `reports/worklog/1410.md`.
