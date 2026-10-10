---
id: 1534
title: registrar console v2
blocked_reason: lead restoring the round-2 work (resume patch was not re-applied after the 14:00 limit)
agent: glm
tier: T1
depends_on: [1530, 1522, 1523, 91522]
verify: make verify
timeout_min: 180
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1534 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/design/language.md (from 1530)
- apps/web/src/app/globals.css

## Plan section
### Task 1534: registrar console v2

**Agent:** glm · **Depends on:** 1530, 1522, 1523 · **Role:** frontend

- [ ] Console per golden screen: an ActionFlow stepper (Announced → Record → Snapshot → Funded → Paid N/N → Reported). Each step shows its time and tx, and the seev.031/seev.036 download buttons sit on the step they belong to. The stepper also shows planned vs effective record time (from `StrikeTiming`), permissionless badges, Defaulted state (shortfall, overdue timer, "declare default" button for anyone, cure by funding), bank confirmations panel (PaidToAgent rows → confirm with reference), disclosure hash panel (fetch seev031, sha256 in the browser, compare with `disclosureHash` → ✓/✗), reconcile panel showing scheme 0/1.
- [ ] Registrar dashboard: replace the empty pipeline with a dense board (status columns that never truncate tickers at 1440/390) + alerts for overdue funding and pending bank confirmations.

**Acceptance:** specs green; Opus design score ≥ 8.

## Lead notes (after 1512–1515, 1519, 1531)
- `declare_default` exists on-chain since 1512 (permissionless; due at `max(payment_at, record_at + finalize_delay) + one series day`, see docs/02-architecture.md "Security review of the plan-15 wave"). 1531 deliberately left it out of `apps/web/src/lib/actionFlow.ts` `nextStep`; add it as a real step (actor "anyone") once the API exposes `defaultedAt`/`inDefault` (1521/1522), with a test in `actionFlow.test.ts`.
- `confirm_bank` is already a StepId (1531); wire it to `payout:confirm-bank` through the API (1522).

## Finish
`make verify` green, commits carry `task: 1534`, `reports/worklog/1534.md` written. Print `DONE:1534` or `BLOCKED:1534 <reason>`.

## Review feedback (round 1, 2026-10-10 13:17) — fix every blocking item first; your previous work is already committed on this branch

### Summary
The feature set is mostly in place: the stepper with times, txs and ISO downloads; planned vs effective record time; a D4 nextStep that mirrors the executor with unit tests; the bank confirmations panel wired to confirm-bank; a browser-side disclosure hash check against the Go anchored bytes; the reconcile scheme; and a 7-column board with default and bank alerts. Web unit tests pass (259/259 plus 1 pre-existing skip). It cannot merge yet, for five reasons. (1) A Defaulted action renders its completed early steps as not done, with 'Announced · Next', because DONE_STATUSES omits Defaulted. (2) The confirm_bank on-chain write never shows its signature or explorer link. (3) The REDM bank fixture's money departs from the brief's numbers, and two panels on one screen disagree (35,000 vs 40,500 required); the default event date contradicts defaultedAt. (4) The 'Anyone can push' chips overlap neighbouring steps in the horizontal stepper at 1440. (5) The 'Bondholder meeting' badge overflows its card on the new 7-column board. All five fixes are small and local.

### Blocking
- apps/web/src/lib/actionFlow.ts:140 — DONE_STATUSES for announce/strike/snapshot/finalize do not include "Defaulted". A defaulted action with no indexed events for those steps (the mock INTR0006, or an indexer lag live) renders Announced as the current step with a 'Next' pill and Record date/Snapshot/Finalized as pending, while the NowBar says 'Fund escrow'. Screenshot registrar_actions_ActnINTR0006…-en-1440.png shows 'Announced · Next' on a coupon that is in default. The new test 'a defaulted action shows the fund step red…' only checks fund and declare_default, which is how this got through.
  **Fix:** Add "Defaulted" to the announce, strike, snapshot and finalize arrays in DONE_STATUSES. In actionFlow.test.ts ('a defaulted action shows the fund step red…'), assert that buildTimeline(a, [], false) returns state 'done' for announce, strike, snapshot and finalize, and that no step has state 'current'.
- apps/web/src/app/(cabinet)/registrar/actions/[pda]/BankConfirmPanel.tsx:79 — The confirm_bank write is an on-chain transaction (ConfirmBankResponse has signature/explorerUrl), but the runWrite call passes no `txs`, so the success toast shows no signature or explorer link. After router.refresh() the row disappears, so the tx is never shown anywhere. AGENTS.md: every action step shows its tx signature with an explorer link.
  **Fix:** Add `txs: (r) => [r.signature ?? ""].filter(Boolean),` to the runWrite options (same pattern as StepButton). Have the mock confirm-bank write return a signature, and in e2e 'bank-routed payouts…' assert that the toast contains a link to explorer.solana.com/tx/.
- apps/web/src/mocks/api.ts:382 — The D6 REDM fixture (ActnREDM0007) money is wrong against the brief and contradicts itself on one screen. Holders with 10/25/65 units all get principal 10,000.00. Net is 1,050/2,625/6,825 (10× too small; it should be coupon 500/1,250/3,250 with principal 10,000/25,000/65,000). The Funding panel shows required 35,000.00 while Where-the-money-goes shows 40,500.00, and the escrow is 1,050,000.00. The bank panel shows 2,625.00 and 6,825.00 to confirm. In the D4 fixture, the ActionDefaulted event ts 1774963236 renders 'Default declared Mar 31, 2026', before the Aug 20 announcement and against defaultedAt Sep 16, 2026 shown in the Funding box.
  **Fix:** ACTION_PDA_7 entitlements: gross/net = 50000/125000/325000, principal = 1000000/2500000/6500000. Set escrowBalance to kzt("10500000","105,000.00 KZT") so required = Σnet + principal = 10,500,000 and both panels show 105,000.00. In mockGet bank-pending set item amounts to 2625000 and 6825000. Change the EntitlementPaid/PaidToAgent events' net to 1050000/2625000/6825000 and give them a ts on or after paymentAt (2026-09-20, e.g. 1789930800). Set the ActionDefaulted event ts to 1789499100 (2026-09-16T00:05+05:00) to match defaultedAt.
- apps/web/src/components/ui/ActionFlow.tsx:215 — Design: in the horizontal stepper at 1440 the 'Anyone can push' ActorChip (shrink-0 whitespace-nowrap) is wider than its step column and overlaps neighbouring steps. On INTR0006 the Snapshot and Finalized chips overlap each other, and the Completed chip covers 'Mar 31, 2026' under 'Default declared'. On REDM0007 the Completed chip covers 'redeemed' under 'Retired'. The 8th/9th step this task adds (declare_default) narrows the columns further.
  **Fix:** In the horizontal (lg+) layout render `<ActorChip actor={s.actor} />` without `long`, so it reads 'Anyone' and fits a column. Keep `long` only in the vertical (<lg) list. Alternatively wrap the chip in `<div className="max-w-full overflow-hidden">` and make ActorChip accept a `min-w-0 truncate` variant. Re-shoot INTR0006 and REDM0007 at 1440 and confirm no chip crosses into the next column.
- apps/web/src/app/(cabinet)/registrar/_components/Pipeline.tsx:60 — Design: with xl:grid-cols-7 a board card is about 145 px wide at 1440. The nowrap kind Badge 'Bondholder meeting' in the Snapshot complete column runs past the card's right border (registrar-en-1440.png), which is clipped/overflowing text on the dense board this task introduced.
  **Fix:** In ActionCard replace the kind `<Badge tone="info">{kindLabel}</Badge>` with wrapping text, e.g. `<span className="text-xs font-bold text-p700">{kindLabel}</span>`, so it wraps inside the card. Or add a `wrap` prop to Badge that swaps `h-6 whitespace-nowrap` for `min-h-6 py-0.5 whitespace-normal` and use it here. Verify at 1440 in EN and RU (RU 'Собрание держателей' is longer).

### Acceptance criteria not met
- Permissionless badges on the stepper — Badges render ('Anyone can push') but overlap neighbouring steps at 1440 (see blocking).
- Defaulted state: shortfall, overdue timer, declare default for anyone, cure by funding — Shortfall 2,000.00, red fund step, 'Default declared' step, NowBar cure button and declare_default nextStep (actor anyone, autofund=false, unit-tested) are present. But the earlier steps of a Defaulted action render as not done, with Announced marked 'Next'.
- Bank confirmations panel (PaidToAgent rows → confirm with reference) — Panel lists PaidToAgent rows and posts to actions/{pda}/confirm-bank (allowlisted, matches the OpenAPI ConfirmBankRequest). The confirm tx signature/explorer link is never shown, and the mock amounts are wrong.
- Dense registrar board, tickers never truncated at 1440/390, alerts for overdue funding and pending bank confirmations — Tickers use break-words. A Defaulted column and overdueFunding/defaultedAlert/bankPending alerts exist and are unit-tested. But the kind badge overflows its card at 1440.
- Opus design score ≥ 8 — Score 6: overlapping actor chips, badge overflow on the board, a misleading 'Next' on a defaulted action, and contradictory money figures on the REDM screen.

Design score: 6/10
