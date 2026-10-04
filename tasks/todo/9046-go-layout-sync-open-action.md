---
id: 9046
title: Go layout sync — Series.open_action and CorporateAction.factor_bps (added by task 009)
agent: glm
tier: T0
depends_on: [046, 009]
verify: make verify
timeout_min: 30
---
## Goal
Task 009 changed two on-chain layouts after 020/046 were written. Bring the Go structs and Borsh decoders back in line with `docs/02-architecture.md` / `programs/qupon_bonds/src/state.rs`.

## Read first
- programs/qupon_bonds/src/state.rs (Series, CorporateAction — the source of truth)
- docs/02-architecture.md (Accounts section)
- services/registrar/internal/chain/ (types.go and the decoders from task 046)

## Steps
1. `Series`: new field `open_action Option<Pubkey>` between `tax_vault` and `reserved`. Borsh: 1-byte tag (0 = None, 1 = Some) followed by 32 bytes only when Some — the field is variable-length, so decode sequentially; `reserved [u8;64]` follows it. Go type: `OpenAction *solana.PublicKey` (nil = None).
2. `CorporateAction`: new field `factor_bps u16` between `completed_at i64` and `reserved [u8;64]`.
3. Update decoders and encoders-in-tests; add round-trip tests for Series with `open_action` = None and = Some, and for CorporateAction with `factor_bps` = 2500.
4. If task 046 compares field counts/offsets with `target/idl/qupon_bonds.json`, make sure those checks pass against the current IDL (`anchor build` regenerates it).

## Acceptance criteria
- [ ] `go test ./internal/chain/...` covers both new fields (None and Some for open_action); `make verify` green.
- [ ] Field order in Go matches `state.rs` exactly for Series and CorporateAction (a test or a comment listing the order).

## Out of scope
Any other account or program change.
