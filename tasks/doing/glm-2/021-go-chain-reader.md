---
id: 021
title: Chain reader: RPC client + account decoders + getProgramAccounts by discriminator (synthetic round-trip tests; real fixtures arrive in task 051)
agent: glm
tier: T1
depends_on: [020, 046]
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
2. Decoders for the four accounts on top of `internal/borsh` (task 046), field order = Rust layout in `docs/02-architecture.md` (8-byte discriminator first); tests: encode synthetic structs with the same package's encoder and decode them back; real on-chain fixtures are wired in task 051.
3. `internal/chain/tokens.go`: read Token-2022 account balance + frozen flag and mint supply/pausable state (parse TLV extensions minimally: only `PausableConfig` paused flag).
4. Service start: index all series by scanning program accounts; `GET /series` returns them.

## Acceptance criteria
- [ ] Decoders round-trip the fixtures; `GET /series` on devnet returns the demo series with correct terms.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/021.md`, then print exactly `DONE:021` or `BLOCKED:021 <reason>`.
