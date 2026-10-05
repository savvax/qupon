---
id: 9021
title: Token-2022 mint decoding — real TLV offsets and Pausable layout; reconcile reports every differing field
agent: glm
tier: T1
depends_on: [021, 022]
verify: make verify
timeout_min: 30
---
## Goal
`internal/chain/tokens.go` never detects `Paused` on a real Token-2022 mint.

## Steps
1. A Token-2022 mint with extensions is padded to 165 bytes, byte 165 is AccountType (1 = Mint), TLV starts at 166 (2-byte type, 2-byte length, value). Fix the TLV walk start (require len > 165 and data[165] == 1).
2. PausableConfig value = OptionalNonZeroPubkey (32 bytes) + paused (1 byte) → paused at value offset 32, value length 33.
3. Fix the test helpers to build the real layout; add a test from real bytes: dump a devnet mint created by `clients/ts/scripts/create-bond-mint.ts` if available (`solana account <mint> --output json -u devnet`), else a hand-built 165+1+TLV buffer.
4. `internal/reconcile` `Entry.diffFields`: use independent `if`s so every differing field is reported, not just the first.

## Acceptance criteria
- [ ] Paused detected in tests on the real layout; `make verify` green.
