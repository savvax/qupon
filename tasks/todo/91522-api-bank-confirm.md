---
id: 91522
title: API: bank-payout confirmations and declare-default for the console
agent: glm
tier: T1
depends_on: [1522]
verify: make verify
timeout_min: 180
---
## Goal
The paying agent must be able to confirm bank-routed payouts (plan 15 D6) from the console, and anyone must be able to
push `declare_default` (plan 15 D4). The CLI commands exist (`payout:confirm-bank`, `action:default`); the API does not
expose them yet. Web task 1534 consumes these endpoints.

## Read first
- AGENTS.md, docs/02-architecture.md (sections "Holder-chosen payout route", "Security review of the plan-15 wave")
- services/registrar/internal/api/advance.go (how a step runs through the executor, role checks, activity rows)
- services/registrar/internal/executor/executor.go (`StepConfirmBank`, `StepDefault`, `Args`)
- services/registrar/internal/chain/types.go (`Entitlement` status 3 = PaidToAgent, `PayoutRoute`, `FetchPayoutRoutesBySeries`)
- clients/ts/src/commands/payout.ts (`payout:confirm-bank --series --index --owner --reference`)

## Do
- `GET /actions/{pda}/bank-pending` (public read): every entitlement of the action with status PaidToAgent →
  `[{owner, entitlementPda, amount (net+principal as Amount), routeBankRefHash (hex)}]` plus `bankPending` from the action.
- `POST /actions/{pda}/confirm-bank` body `{owner, reference}` — only for an authenticated user whose role is
  paying_agent or registrar (follow the role checks used by the other operator endpoints); runs
  `payout:confirm-bank --series <name> --index <n> --owner <owner> --reference <reference>` via the executor (120 s cap),
  records an activity row `advance:confirm_bank_payout`, returns `{ok, signature, explorerUrl}`. Reject an empty
  reference (400) and an owner that is not PaidToAgent on this action (409) before calling the CLI.
- `declare_default` already flows through `POST /actions/{pda}/advance` (NextStep returns it when due) — add a test that
  proves it, no new endpoint.
- openapi.yaml (both copies, identical) + regenerate `apps/web/src/lib/api-schema.d.ts` (`cd apps/web && pnpm gen`).
- Tests with the fake CLI (see existing advance tests): happy path, wrong role 403, empty reference 400, not-pending 409.

## Acceptance
`go test ./services/registrar/...` green; openapi copies identical; `make verify` green.
Commit `feat(registrar): bank-payout confirmation endpoints for the paying agent` (`task: 91522`).

## Finish
Write `reports/worklog/91522.md` (3–6 lines), commit with `task: 91522`, print `DONE:91522` or `BLOCKED:91522 <reason>`.
