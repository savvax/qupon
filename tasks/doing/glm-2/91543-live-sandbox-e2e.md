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

## Review feedback (round 1, 2026-10-10 19:51) — fix every blocking item first; your previous work is already committed on this branch

### Summary
The diff adds one live Playwright spec (apps/web/e2e/live/sandbox.spec.ts) and the worklog. The selectors and texts match the real UI messages and the Go sandbox service (10-char id, SBX ticker alphabet, calendar rate, Now-bar paid sentence, trade sentence, explorer href format). The spec skips cleanly without E2E_BASE_URL. One blocker: the non_kyc_transfer assertion uses `[\w:]+` for the error, copied from the mock's 'AccountFrozen'. On devnet, the refusal string comes from the CLI's log scrape: either 'Program TokenzQd… failed: custom program error: 0x11' (a frozen destination ATA, per reports/dvp-spike-2026-10-06.md) or an Anchor 'Name (code): msg'. Both contain spaces, so the live journey can never pass that step. Fix: loosen it to `Refused \(.+\): an outsider's bond account stays frozen`. No UI change, so there was no screenshot pass. I could not run tests here because Bash is denied; I relied on the orchestrator's green make verify.

### Blocking
- apps/web/e2e/live/sandbox.spec.ts:80 — The non-KYC refusal assertion `/Refused \([\w:]+\): an outsider's bond account stays frozen/` will fail on every live run. On the live path the error is not a bare word like the mock's `AccountFrozen`. `sandbox:refuse` sets `error = anchorErrorFromLogs(logs) ?? <first log line containing "failed"> ?? "TransactionFailed"` (clients/ts/src/commands/sandbox.ts:90-91), and the Go service passes it through unchanged (scenarios.go:209). A transfer into the outsider's frozen-by-default ATA is rejected by Token-2022 before the hook runs. Devnet evidence in reports/dvp-spike-2026-10-06.md rows 8 and 22 shows the logs: `Program log: Error: Account is frozen` / `Program TokenzQd… failed: custom program error: 0x11`. So the page renders `Refused (Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb failed: custom program error: 0x11): an outsider's …`. An Anchor/hook refusal would render `Refused (Name (6xxx): msg): …`. Both contain spaces or parentheses, which `[\w:]+` cannot match, so the spec's 'refusal is explained' step can never pass against the deployment.
  **Fix:** Change the regex to `/Refused \(.+\): an outsider's bond account stays frozen/` (any error text). Optionally also add `await expect(page.getByRole("region", { name: "Transactions" })).toContainText("Transfer to a wallet without KYC refused")`, as the mock spec does, so the failed tx also shows in the feed. Keep the existing EXPLORER href check on `refused.locator("a").first()`.

### Acceptance criteria not met
- non_kyc_transfer asserts the on-chain refusal is explained with a tx/simulation link — Line 80's `[\w:]+` only matches the mock's 'AccountFrozen'. The live error string (Token-2022 'Program … failed: custom program error: 0x11', or an Anchor 'Name (code): msg') contains spaces, so this step fails live. See blocking.
