---
id: 1403
title: LiteSVM failure-path tests for account substitution and status guards
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 60
---
## Goal
Add missing failure-path tests (no program code changes) in `programs/qupon_bonds/tests/`.

## Steps (one `assert_err` each, reuse existing test helpers)
- pay_batch (settle.rs ~L149-160): pay to an attacker cash ATA → AccountOwnerMismatch; Entitlement from another action → InvalidParams; Investor from another series → AccountOwnerMismatch.
- snapshot_batch (snapshot.rs ~L112-136): non-registered ATA, foreign-series Investor, wrong Entitlement PDA, mint not paused → AccountMintMismatch / AccountOwnerMismatch / MintNotPaused.
- retire_batch (retire.rs ~L70-104): foreign-series Investor, ATA owned by someone else, ATA of another mint; a second retire_batch is a no-op (holders_retired unchanged).
- cancel_action after strike → WrongStatus; cast_vote by a non-holder → error; fund_action before snapshot → WrongStatus; complete_action while Funded → WrongStatus.

## Acceptance criteria
- All new tests pass; `cargo test -p qupon_bonds` green; `make verify` green; `reports/worklog/1403.md`.

## Out of scope
Changing program code. If a test reveals a real bug, write it to `reports/questions/1403-*.md` and continue.
