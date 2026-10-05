---
id: 9011
title: Go layout sync — CorporateAction.total_principal (added by task 011)
agent: glm
tier: T0
depends_on: [011, 9046]
verify: make verify
timeout_min: 30
---
## Goal
Task 011 added `total_principal u64` to `CorporateAction` between `factor_bps u16` and `reserved [u8;64]`, and new error `PaymentsIncomplete` (appended last). Bring Go decoders back in line with `programs/qupon_bonds/src/state.rs`.

## Read first
- programs/qupon_bonds/src/state.rs (CorporateAction — source of truth), docs/02-architecture.md
- services/registrar/internal/chain/ (types.go, decode.go and tests from 046/9046)

## Steps
1. Add `TotalPrincipal uint64` after `FactorBps` in the Go `CorporateAction` struct, decoder and test encoder.
2. Round-trip test with `factor_bps = 2500`, `total_principal = 1_000_000`.
3. If any Go code maps program error codes, add `PaymentsIncomplete` = 6000 + its index in error.rs.

## Acceptance criteria
- [ ] `go test ./internal/chain/...` covers the new field; field order matches state.rs; `make verify` green.
