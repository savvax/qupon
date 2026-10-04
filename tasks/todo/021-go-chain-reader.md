---
id: 021
title: Chain reader: RPC + Borsh decoders + getProgramAccounts by discriminator, with fixtures from state:dump
agent: glm
tier: T1
depends_on: [020, 013]
verify: make verify
timeout_min: 60
---
## Goal
Read the four account types from devnet into Go structs without trusting any off-chain copy.

## Read first
- docs/02-architecture.md (accounts)
- docs/04-stack.md (solana-go v2, never filter by dataSize)
- clients/ts/src/generated/accounts/*.ts (layouts)

## Steps
1. `internal/chain/client.go`: solana-go v2 RPC client with timeouts and retry; `GetAccount`, `GetProgramAccounts(discriminator, memcmp filters)`; discriminators computed as `sha256("account:Series")[:8]` etc.
2. `internal/chain/borsh.go`: minimal Borsh reader (u8/u16/u32/u64/i64/[u8;N]/Pubkey/bool) and decoders for the four accounts; table tests from base64 fixtures produced by `qupon state:dump --raw` (add `--raw` to the CLI if missing: base64 account data per PDA).
3. `internal/chain/tokens.go`: read Token-2022 account balance + frozen flag and mint supply/pausable state (parse TLV extensions minimally: only `PausableConfig` paused flag).
4. Service start: index all series by scanning program accounts; `GET /series` returns them.

## Acceptance criteria
- [ ] Decoders round-trip the fixtures; `GET /series` on devnet returns the demo series with correct terms.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/021.md`, then print exactly `DONE:021` or `BLOCKED:021 <reason>`.
