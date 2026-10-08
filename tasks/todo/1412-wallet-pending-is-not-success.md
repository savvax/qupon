---
id: 1412
title: Web: a pending wallet tx is not a sent leg; no false "expired"
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 40
---
## Goal
1. `apps/web/src/app/(cabinet)/investor/_components/OpenTrades.tsx` (~L133-135) treats the result of `useWalletWrite` as success when the tx is only pending (`pending: true`, unconfirmed) and marks the trade leg as sent. Only a confirmed result counts; pending shows the existing "pending, check the explorer" state and leaves the leg actionable after a refresh.
2. `apps/web/src/lib/walletSigner.ts` (~L145-152) reads the signature status before the block height, so a tx that landed in the last valid block can be reported "expired, not executed". Re-check `getSignatureStatuses` once right before throwing the expiry error.

## Acceptance criteria
- Vitest: fake rpc where the status appears exactly when block height passes lastValidBlockHeight → resolves confirmed, not expired.
- Vitest or component test: pending result → leg not marked sent.
- `make verify` green; `reports/worklog/1412.md`.
