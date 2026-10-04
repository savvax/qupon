---
id: 9044
title: TS entitlement lib — u64 overflow parity with Rust and rounding-tolerance tests
agent: flash
tier: T1
depends_on: [044]
verify: make verify
timeout_min: 20
---
## Goal
`clients/ts/src/lib/entitlement.ts` must fail where `crates/entitlement` returns `Error::Overflow`, and `roundingWithinTolerance` needs tests.

## Read first
- crates/entitlement/src/lib.rs (`entitlement`, `rounding_within_tolerance`), clients/ts/src/lib/entitlement.ts and its test

## Steps
1. Throw `MathError("Overflow")` when `units` or `face` exceed u64 (2^64−1), or when gross/tax/net/principal exceed u64.
2. Vitest: overflow case; `roundingWithinTolerance` for fixtures `totals_check` (true), MCAL 47 days with 10 units and sum 20,824 (true — rounded per-unit 2,082 × 10 = 20,820 must NOT be the reference) and sum 20,826 (false).

## Acceptance criteria
- [ ] New tests pass; `make verify` green.
