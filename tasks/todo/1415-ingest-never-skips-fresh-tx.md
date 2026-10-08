---
id: 1415
title: Ingest never skips a fresh transaction as "pruned"
agent: glm
tier: T0
depends_on: []
verify: make verify
timeout_min: 45
---
## Goal
`services/registrar/internal/ingest/ingest.go` (~L159-167, Poll ~L101-105): when getTransaction returns "not found" (or a nil tx) the poller logs "pruned", returns nil and Poll moves the cursor past it. A lagging RPC node (Helius slightly behind the fallback that listed the signature) thus loses EntitlementPaid / ActionAnnounced events forever: no activity row, no notification.

## Steps
1. On "not found" / nil tx: try the fallback RPC too (today it is skipped for exactly this error).
2. If still missing and the signature is younger than 1 hour (`s.BlockTime`; missing BlockTime counts as young), return an error so Poll does not advance the cursor (it retries next tick). Only older signatures are skipped as pruned.
3. Keep the existing behaviour for failed txs.

## Acceptance criteria
- Test: fake RPC returns null for a fresh signature on the first poll → cursor unchanged, no error spam beyond one warn; second poll returns the tx → row inserted.
- Test: an old (2 h) not-found signature is skipped and the cursor advances.
- `make verify` green; `reports/worklog/1415.md`.
