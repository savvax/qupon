---
id: 91543
title: live e2e: a judge's sandbox end to end on the deployed site
agent: glm
tier: T1
depends_on: [1524]
verify: make verify
timeout_min: 180
---
## Goal
1540 runs the live e2e suite against the deployed site (`E2E_BASE_URL`). Add the sandbox journey to it.

## Read first
- apps/web/e2e/live/*.spec.ts and reporter.ts (live conventions: no mocks, generous timeouts, retries), apps/web/e2e/sandbox.spec.ts
  (mock-mode journey), apps/web/src/lib/sandbox.ts (API contract), tasks/done/1524-go-sandbox-api.md.

## Do
- `apps/web/e2e/live/sandbox.spec.ts`: open the landing, click "Try it in 3 minutes", wait for `/sandbox/<id>`, assert
  the demo-clock badge, then wait (≤ 7 minutes, poll the page) until the first coupon shows as paid with real tx links
  (`explorer.solana.com/tx/…?cluster=devnet`); run the `dvp_trade` scenario and assert accrued + clean are shown; run
  `non_kyc_transfer` and assert the on-chain refusal is explained with a tx/simulation link. Skip with a clear message when
  `E2E_BASE_URL` is not set.
- Keep it independent from other live specs (its own sandbox, cookie-isolated context).

## Acceptance
Spec type-checks and is skipped without `E2E_BASE_URL`; `make verify` green. Do not run against production in this task.
Commit `test(web): live sandbox journey` (`task: 91543`).

## Finish
Write `reports/worklog/91543.md` (3–6 lines), commit with `task: 91543`, print `DONE:91543` or `BLOCKED:91543 <reason>`.
