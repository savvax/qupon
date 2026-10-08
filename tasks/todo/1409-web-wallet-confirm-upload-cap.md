---
id: 1409
title: Web: wallet txs never report success unconfirmed; upload size enforced; session JSON guard
agent: glm
tier: T0
depends_on: []
verify: make verify
timeout_min: 60
---
## Goal
1. `apps/web/src/lib/walletSigner.ts` ~L146-148: after 60 s `signAndSendWithWallet` returns the signature as success even if the tx was dropped — the UI shows a purchase that never happened. Keep `lastValidBlockHeight`; poll until confirmed or block height exceeded → throw "expired, not executed"; if time runs out while still valid, return a distinct pending result and show "pending, check the explorer" (EN+RU) instead of success.
2. `apps/web/src/app/api/bo-upload/[...path]/route.ts` ~L26-27, 59: the size cap reads only Content-Length; chunked bodies are buffered unbounded. Reject requests without Content-Length with 411, or stream with a byte counter aborting above MAX_BYTES (413).
3. `apps/web/src/lib/session.ts` ~L85-88: `res.json()` unguarded → a 200 HTML error page 500s every cabinet page. `.json().catch(() => null)` → treat as signed out.

## Acceptance criteria
- Vitest: fake rpc with null statuses and passing block height → signAndSendWithWallet rejects.
- Route test or unit: chunked/no Content-Length → 411/413.
- Vitest: getSession with 200 "<html>" → null.
- `make verify` green; `reports/worklog/1409.md`.
