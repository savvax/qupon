---
id: 9128
title: Go event decoder — ActionAnnounced layout drift; diff all event layouts against the IDL
agent: glm
tier: T1
depends_on: [9028]
verify: make verify
timeout_min: 40
---
## Goal
`services/registrar/internal/ingest/events.go` ActionAnnounced layout is stale; decode fails on trailing bytes and ParseLogs drops every announcement silently.

## Read first
- programs/qupon_bonds/src/events.rs (source of truth), target/idl/qupon_bonds.json (`events` + `types`), services/registrar/internal/ingest/events.go

## Steps
1. ActionAnnounced field order: series pk, action pk, index u32, kind u8, mandatory u8, corp_id [u8;16], official_id [u8;16], record_at i64, payment_at i64, period_start i64, period_end i64, accrual_days u32, rate_bps u32, per_unit_gross u64, per_unit_principal u64, factor_bps u16, cash_mint pk, escrow pk, proposal_new_rate_bps u32, proposal_new_maturity i64, voting_ends_at i64, slot u64, timestamp i64.
2. Add a test that loads `target/idl/qupon_bonds.json` (skip if absent) and asserts every Go event layout has the same field names/types/order as the IDL type of that event — so future program changes fail loudly.
3. ParseLogs: log decode errors (slog.Warn with event name) instead of dropping them silently.

## Acceptance criteria
- [ ] IDL-diff test passes for all 18 events; `make verify` green.
