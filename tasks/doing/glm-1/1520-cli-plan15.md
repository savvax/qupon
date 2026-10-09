---
id: 1520
title: CLI — crank as anyone, claim, routes, sandbox helpers, proof hooks
agent: glm
tier: T0
depends_on: [1515, 1516]
verify: make verify
timeout_min: 120
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1520 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)

## Plan section
### Task 1520: CLI — crank as anyone, claim, routes, sandbox helpers, proof hooks

**Agent:** glm · **Depends on:** 1515, 1516 · **Role:** ts-client

**Files:** `clients/ts/src/commands/action.ts`, `lifecycle.ts`, `payout.ts` (new group; register in `commands/index.ts`), `common.ts` (`signer(cmd, "any")` = `--keypair` or `QUPON_CRANK_KEYPAIR` or registrar), tests next to each.

- [ ] `action:strike|snapshot|finalize|pay|complete|retire|default` accept any keypair (role `any`); `action:claim --series --index --owner <pubkey>` = `pay_batch` for one holder signed by the holder (`QUPON_INVESTOR_KEYPAIR`) with optional `--fee-payer` keypair; `payout:route --series --route wallet|bank --bank-ref <text>` (hashes `sha256(text)`; prints the hash, never the text); `payout:confirm-bank --series --index --owner --reference <text>`; `disclosure:attach --series --index --file <path>` (sha256 of file bytes).
- [ ] `action:announce` on a demo-clock series: record_at = period_end − 1 series-day; payment_at = period_end + `--payment-delay-days` (default 0) series-days.
- [ ] JSON contract unchanged (`{ok, signature, slot, …}`); unit tests for argument → instruction building (no network).
- [ ] Commit `feat(cli): permissionless crank, claim, payout routes, disclosure`.

**Acceptance:** `pnpm --filter @qupon/client test` covers each new command's builder; `make verify` green.

## Already on main (lead, tasks 1514/1515) — do not redo
- `payout:route` and `payout:confirm-bank` exist in `clients/ts/src/commands/payout.ts` (registered); `disclosure:attach` in `commands/disclosure.ts`. Only add builder unit tests for them if missing.
- `action:pay` already reads each holder's PayoutRoute (`payoutRouteIsBank`) and routes bank holders to the paying agent's cash ATA; `trade:create` passes the open action and prints `accrued`/`clean` (`tradeAccrued`).
- Remaining for you: role `any` for the crank commands, `action:claim`, demo-clock `action:announce` dates, tests.

## Finish
`make verify` green, commits carry `task: 1520`, `reports/worklog/1520.md` written. Print `DONE:1520` or `BLOCKED:1520 <reason>`.
