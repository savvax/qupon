---
id: 1535
title: bond dossier v2 + board
agent: glm
tier: T1
depends_on: [1530, 1502, 1525]
verify: make verify
timeout_min: 180
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1535 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/design/language.md (from 1530)
- apps/web/src/app/globals.css

## Plan section
### Task 1535: bond dossier v2 + board

**Agent:** glm · **Depends on:** 1530, 1502, 1525 · **Role:** frontend

- [ ] `/bonds/[mint]` per golden screen: header with status incl. IN DEFAULT / DEMO CLOCK, yield block (clean, accrued, dirty, YTM, current yield), LifecycleRail of all actions, schedule, terms, KASE panel and documents moved below the life story, trade ticket preview showing accrued split for N bonds.
- [ ] Register "as of record date": one tab per action, with share bars and a per-holder calculation drawer (30E/360 days, gross, tax, net, principal, formula line `units × per-unit = amount`). Journal of every operation with explorer links. "Export issue audit (CSV)" builds the CSV client-side from the API data.
- [ ] `/bonds`: featured first, sandboxes hidden, human titles, empty/error states. Statuses show the life stage ("Record date soon", "Paying", "Voting", "Redeemed", "In default").
- [ ] Curated showcase: `services/registrar` admin seeds 4 featured demo series, one per scenario (coupon, redemption, meeting, early call), each with a distinct ticker, a human name and an ISIN of the form `KZ2C0QPN000N`. The data is created by 1540 on devnet; this task only ships the config/seed code and the board ordering.

**Acceptance:** specs green; Opus design score ≥ 8.

## Lead notes (after 1532, 1536)
- `/proof/[mint]` exists (task 1536): the dossier header gets a prominent "Verify on-chain" link to `/proof/<mint>`, and each
  action row of the register links to its card there (`/proof/<mint>#<actionPda>` — check the anchor ids 1536 renders).
- The shared "implemented vs simulated" grid is `ScopeGrid` (from 1536) — reuse it, never copy it.

## Finish
`make verify` green, commits carry `task: 1535`, `reports/worklog/1535.md` written. Print `DONE:1535` or `BLOCKED:1535 <reason>`.

## Review feedback (round 1, 2026-10-10 10:22) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Fail. Most of the scope is delivered: dossier header with Defaulted/Demo chips and 'Verify on-chain', rail stubs for calls and redemptions, register→proof anchors, a yield block plus SIMULATED trade ticket, a life-stage board with tested boardStage, and an admin-gated idempotent showcase seed. Five things block merge. (1) The yield/accrued numbers use the real date instead of the bond's demo-clock date, so every featured showcase series shows wrong accrued and dirty figures. (2) Desktop dossier layout: a ≈570 px empty dashed placeholder duplicates the register empty state (design score 6). (3) The mock showcase data is incoherent on the golden screen: three different next-coupon dates, and the announced coupon is missing from the rail. (4) The rest.go comparator returns -1 both ways for non-featured series, breaking stable order. (5) TestValidISIN cases are mislabelled and never isolate the check-digit branch. Tests run: go test ./internal/api -run 'Showcase|ValidISIN|Series' ok; vitest boardStage 5/5 pass; one shots pass, en/ru × 1440/390 (the QPNb1 route I guessed 404'd, so the populated register was judged from code only).

### Blocking
- apps/web/src/app/(public)/bonds/[mint]/page.tsx:537 — The yield block and the current-period lookup ignore the demo clock. `today = almatyToday()` uses the real calendar date, but every showcase series runs on `daySecs: 4`, so a 12-month showcase bond reaches maturity on its own clock in about 24 minutes. The dossier then shows accrued interest, dirty price and the trade-ticket split as of day 1 of period 1 for a bond that is already matured or redeemed. These wrong money figures appear on exactly the series the board features.
  **Fix:** `import { bondDate } from "@/lib/sandbox"` and compute `const today = series.demoClock ? bondDate(series.issueDate.slice(0, 10), series.demoClock, Date.now()).date : almatyToday();`. In YieldBlock, when `today >= maturityDate.slice(0,10)` or `series.status` is Matured or Closed, render `—` for accrued, dirty and YTM and hide the ticket with a one-line "Redeemed: no accrued interest" note. Add a vitest that pins one case: demoClock {daySecs:4, issueTs:T}, issueDate 2026-10-09, now = T+40s → today 2026-10-19.
- apps/web/src/app/(public)/bonds/[mint]/page.tsx:657 — Design: with no paid coupon yet, which is every showcase series before 1540 runs them, the left 2/3 column holds a dashed placeholder repeating the register empty state ('No snapshot yet…'). The grid row stretches it to the new YieldBlock's height (≈570 px of empty dashed box at 1440). The same sentence then appears again in the Register section directly below.
  **Fix:** Add `lg:items-start` to the grid div at line 657. Replace the placeholder text with a money-flow-specific key, `bond.money.empty`: 'No payment yet: the money flow of the first coupon appears here once it is paid' (add en/ru/kk). Give the placeholder `flex items-center` so it reads as a short note, not a tall empty card.
- apps/web/src/mocks/api.ts:131 — Design and coherence: the mock showcase data contradicts itself on the golden dossier. The KPI reads 'Next coupon Jan 3, 2027'. The rail and schedule put Coupon 1 on Apr 9, 2027, marked Projected. The Now bar says 'Coupon AlmatyPower-INTR-0001 is in progress: Announced' with record date Oct 14, which is also what drives 'Record date soon' on the board. The announced coupon never appears on the rail because its `periodEnd` (2027-01-03) matches no schedule period (2027-04-09). `accrualDays: 180` also disagrees with the 2026-10-09→2027-01-03 period.
  **Fix:** Make the SHOWCASE_SERIES mock self-consistent. Set `nextCouponDate` to the first schedule payment date (2027-04-09T00:00:00+05:00). Set the INTR action's `periodEnd` to 2027-04-09 and `periodStart` to 2026-10-09, with `accrualDays: 180`. Give it a recordAt of 2027-04-08 and a paymentAt of 2027-04-09, or let the schedule link it via `actionPda`. Shift the board's 'record soon' fixture so recordAt stays within 10 days of the test clock if that state must still show. Re-shoot and confirm the rail shows Coupon 1 as live/Next with the Now bar's action.
- services/registrar/internal/api/rest.go:519 — Board-ordering regression: removing `case a.Featured == b.Featured: return 0` makes the comparator return -1 for both (a,b) and (b,a) when neither series is featured. That violates the slices.SortStableFunc contract and reverses or scrambles the non-featured group, breaking the 'scan order stays stable' property 1525 relied on.
  **Fix:** After the `a.Featured && b.Featured` case, add `case a.Featured == b.Featured: return 0` (both non-featured). Extend TestShowcaseSeedFeaturesAndHides with a second non-featured real-clock series and assert the two keep their AllSeries order.
- services/registrar/internal/api/showcase_test.go:51 — Three TestValidISIN cases do not test what their comments claim. `KZ2C0QPN00019` ('wrong check digit') and `KZ2C0QPN0001X` ('non-digit tail') are 13 characters and fail on length. `KZ2C0QPN0001` ('too short') is 12 characters and actually fails on the check digit. The check-digit and non-digit branches are never isolated.
  **Fix:** Use `{"KZ2C0QPN0019", false} // wrong check digit (correct is 8)`, `{"KZ2C0QPN001", false} // too short` and `{"KZ2C0QPN001X", false} // non-digit tail`.

### Acceptance criteria not met
- Yield block (clean, accrued, dirty, YTM, current yield) + trade ticket accrued split for N bonds — YieldBlock.tsx has all five rows and a ticket using @qupon/client accrued/yield (10 bonds → 10,000.00 + 2.78 = 10,002.78). However, `today` is the real Almaty date, not the bond's demo-clock date, so numbers are wrong for every demo-clock (showcase) series.
- Registrar showcase seed: 4 featured demo series, one per scenario, distinct ticker, human name, ISIN KZ2C0QPN000N; board ordering — showcase.go defines 4 scenarios with Luhn-valid ISINs. The admin-gated idempotent seed is tested (go test ./internal/api -run 'Showcase|ValidISIN|Series' ok). But the rest.go comparator change breaks the ordering of non-featured series, and the ISIN tests mislabel their cases.
- Opus design score ≥ 8 — Board is clean (≈8). Dossier at 1440 has a ≈570 px empty dashed placeholder duplicating the register empty state. The mock dossier shows three different next-coupon dates, and the announced coupon is missing from the rail. Score 6.

Design score: 6/10
