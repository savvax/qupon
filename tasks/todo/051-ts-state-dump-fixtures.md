---
id: 051
title: Real on-chain fixtures: `qupon state:dump --raw` → fixtures/accounts/*.b64, wired into Go decoder tests
agent: glm
tier: T1
depends_on: [013, 012, 046]
verify: make verify
timeout_min: 30
---
## Goal
Prove Rust ↔ Go layout parity on real account data.

## Read first
- clients/ts/src/commands/state.ts
- services/registrar/internal/chain/decode.go

## Steps
1. Add `--raw` to `state:dump` (base64 account data + pubkey per PDA); dump the demo series after a coupon run (LiteSVM export is acceptable if devnet is unavailable: add `tests/export_fixtures.rs` behind env `EXPORT_FIXTURES=1`).
2. `fixtures/accounts/{series,investor,action,entitlement}.b64` + `.json` expected decode; Go tests in `internal/chain/decode_real_test.go` assert every field.

## Acceptance criteria
- [ ] Go decoders pass on real data; mismatch found → fix the decoder, never the fixture.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/051.md`, then print exactly `DONE:051` or `BLOCKED:051 <reason>`.
