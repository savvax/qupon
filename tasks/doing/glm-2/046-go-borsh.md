---
id: 046
title: Go Borsh encoder/decoder package with Anchor discriminators (synthetic round-trip tests)
agent: glm
tier: T1
depends_on: [020]
verify: make verify
timeout_min: 40
---
## Goal
Foundation for the chain reader: a tiny, well-tested Borsh layer so decoders are trivial and testable without the chain.

## Read first
- docs/02-architecture.md (account layouts)
- https://borsh.io spec summary (u8..u64, i64, bool, [u8;N], Pubkey = 32 bytes, Option = 1+payload, Vec = u32 len + items)

## Steps
1. `services/registrar/internal/borsh`: `Reader` (`U8, U16, U32, U64, I64, Bool, Bytes(n), Pubkey`), `Writer` symmetric, `AnchorDiscriminator(kind, name)` = sha256("account:Name")[:8] / sha256("event:Name")[:8].
2. Decoders `DecodeSeries/DecodeInvestor/DecodeCorporateAction/DecodeEntitlement` in `internal/chain/decode.go` using the layouts; encoders only in tests.
3. Round-trip tests + a test that the discriminator for `Series` matches the IDL (`target/idl/qupon_bonds.json` → accounts[].discriminator) when the IDL file exists.

## Acceptance criteria
- [ ] `go test ./internal/borsh/... ./internal/chain/...` green; lint clean.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/046.md`, then print exactly `DONE:046` or `BLOCKED:046 <reason>`.
