---
id: 91544
title: statements and reports: default/cure and bank-routed payouts
agent: glm
tier: T1
depends_on: [1521]
verify: make verify
timeout_min: 90
---
## Goal
Investor statements and issuer reports must tell the plan-15 story: a payout that went through the bank route, the
paying agent's confirmation, and a default followed by its cure.

## Read first
- services/registrar/internal/api/reports.go (+ tests), apps/web/src/app/(cabinet)/investor/statements and
  investor/reports, apps/web/src/app/(cabinet)/issuer (reports), services/registrar/internal/ingest/events.go
  (`PaidToAgent`, `BankPayoutConfirmed`, `ActionDefaulted`, `DefaultCured` layouts)

## Do
- Investor statement rows: a bank-routed payout appears once, as "paid via bank (paying agent)", with gross, withheld
  tax, net, the agent payout tx and — once confirmed — the confirmation tx and reference hash; unconfirmed rows say
  "awaiting bank confirmation". CSV export gains `route` and `bank_confirmation_tx` columns.
- Issuer report per action: required vs funded, `defaulted_at`, `cured_at`, late seconds, and the count of bank-routed
  payouts confirmed / pending.
- Go tests with stored activity rows; web unit tests for the row mapping; en/ru/kk strings (label bank transfers
  SIMULATED).

## Acceptance
`go test ./services/registrar/...`, web typecheck/lint/test green; `make verify` green.
Commit `feat(reports): bank-routed payouts and default/cure in statements` (`task: 91544`).

## Finish
Write `reports/worklog/91544.md` (3–6 lines), commit with `task: 91544`, print `DONE:91544` or `BLOCKED:91544 <reason>`.
