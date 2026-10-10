---
id: 1535
title: bond dossier v2 + board
agent: claude
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

## Review feedback (round 2, 2026-10-10 12:31) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Fail. Round 1's server and test items are fixed: the stable comparator, the ISIN test cases, the money-flow empty key and the items-start layout. Go showcase tests pass. The board looks good: featured first, life-stage chips, demo-clock chips. The demo-clock yield fix has two problems. bondDate is not clamped to maturity, and the mock showcase issueTs is a fixed past timestamp, so at today's real time every showcase dossier shows 'Price and yield as of May 2449' and 'Redeemed: no accrued interest…' on a bond that is Active with Coupon 1 in progress. The trade ticket, an acceptance item, never renders on any showcase dossier. Fix: clamp the as-of date to maturity in page.tsx, and compute the mock issueTs per request so the bond date sits at day 10 (Oct 19, 2026). Then re-shoot and confirm the ticket shows 10 bonds → 10,000.00 + 27.78 = 10,027.78 ₸. Design score 6.

### Blocking
- apps/web/src/app/(public)/bonds/[mint]/page.tsx:539 — The demo-clock as-of date is not clamped to maturity. On any demo-clock series that has passed its own maturity, the yield block header shows an absurd date: the shots show 'as of May 7, 2449' (en) and 'на 08.05.2449' (ru). On devnet a 12-month showcase bond (daySecs 4) passes maturity in about 24 minutes, so every featured series will soon show a year far in the future.
  **Fix:** Keep the raw bond date for the redeemed test and clamp the displayed date. `const bondToday = series.demoClock ? bondDate(series.issueDate.slice(0, 10), series.demoClock, Date.now()).date : almatyToday(); const maturity = series.maturityDate.slice(0, 10); const today = bondToday < maturity ? bondToday : maturity; const redeemed = series.status === "Matured" || series.status === "Closed" || bondToday >= maturity;`
- apps/web/src/mocks/api.ts:151 — The mock showcase demo clock uses a fixed `issueTs: 1_791_000_000` (about 2026-10-03). At 4 s per day, today's real time puts all four showcase bonds roughly 150,000 civil days in. So every showcase dossier shows 'Redeemed: no accrued interest remains on a matured bond', with dashes for accrued, dirty and YTM, on a bond whose status chip says Active, whose Now bar says Coupon 1 is Announced, whose rail shows Coupon 1 In progress and whose KPI says Next coupon Apr 9, 2027. The trade ticket, an acceptance item ('trade ticket preview showing accrued split for N bonds'), is therefore never rendered on any showcase dossier. Round 1's coherence fix is undone here.
  **Fix:** Pin the mock bond date per request instead of using a constant. In mockGet, wherever showcase series are returned (`/series` and `/series/{mint}`), map them to `{ ...s, demoClock: { ...s.demoClock!, issueTs: Math.floor(Date.now() / 1000) - 10 * s.demoClock!.daySecs } }` so the bond date is always 2026-10-19 (day 10 of period 1). Re-shoot /bonds/PwrAlmtDem0Mint11111111111111111111111111111 at 1440 and confirm: 'as of Oct 19, 2026'; accrued per bond 2.78 ₸; dirty per bond 1,002.78 ₸; the ticket is visible with 10 bonds → clean 10,000.00 + accrued (10 days) 27.78 = 10,027.78 ₸.
- apps/web/src/app/(public)/bonds/[mint]/page.tsx:680 — Design score 6/10 (below 8). The golden dossier contradicts itself: the yield card says the bond is redeemed while the header, rail, Now bar and KPIs say it is active with a coupon in progress. The main interactive element of the card, the trade ticket, is missing.
  **Fix:** Resolved by the two fixes above. After re-shooting, the yield card on PwrAlmtDem0Mint… must show live accrued, dirty and YTM values plus the SIMULATED trade ticket, and must not show the Redeemed note, at both 1440 and 390.

### Acceptance criteria not met
- Dossier: header with status incl. IN DEFAULT / DEMO CLOCK, yield block (clean, accrued, dirty, YTM, current yield), LifecycleRail of all actions, schedule, terms, KASE/docs below, trade ticket accrued split for N bonds — Header has the Defaulted chip, Demo clock chip and Verify on-chain; the rail includes call/redemption stubs. In the mock shots every showcase dossier's yield block reads 'as of 2449' with the Redeemed note, and the ticket is hidden: unclamped bondDate plus a fixed mock issueTs.
- Round-1 review items fixed — Comparator, ISIN test labels, money.empty key and lg items-start: fixed. Demo-clock yield: implemented, but unclamped, and the mock clock makes every showcase bond read as matured, so the mock is incoherent again.
- Opus design score ≥ 8 — Board about 8. Dossier 6: the yield card contradicts the rest of the page and the ticket is missing.

Design score: 6/10

## Review feedback (round 3, 2026-10-10 12:59) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Fail on a single item. Both round-2 blockers are fixed exactly as asked. The as-of date is clamped to maturity, and the mock showcase clock is pinned per request. The Almaty Power dossier now reads 'as of Oct 19, 2026' with accrued 2.78 ₸, dirty 1,002.78 ₸ and YTM 9.99%. Its SIMULATED ticket shows 10 bonds → 10,000.00 + 27.78 = 10,027.78 ₸ at both 1440 and 390, and it is coherent with the header, rail, Now bar and KPIs. The register, journal, CSV export, KASE panel, documents and the life-stage board all render correctly in en and ru. vitest boardStage + sandbox: 7/7 pass. The Go tests could not be run here because permission was denied, but the Go code has not changed since round 2 confirmed them green. Design score 8. One blocker: the trade ticket throws during render on a fractional bond count ('1.5') or a clean price below 0.005%, through BigInt(non-integer) and currentYield(0n). When it throws, bonds/error.tsx replaces the whole dossier. The fix is two lines in YieldBlock's useMemo: floor n, and return null when cleanPerUnit ≤ 0.

### Blocking
- apps/web/src/app/(public)/bonds/[mint]/YieldBlock.tsx:74 — The trade ticket can crash the whole dossier. If you type a fractional bond count such as "1.5" or "0.5", n becomes 1.5 and `BigInt(n)` (lines 80–81) throws a RangeError while useMemo runs during render. Typing a clean price below 0.005% (e.g. "0.001") makes `Math.round(pct*100)` return 0, so cleanPerUnit is 0n and `currentYield()` throws `cleanPrice must be positive` (yield.ts:31). In both cases the render throws, and `(public)/bonds/error.tsx` replaces the entire dossier with the error page. A judge can trigger this with one keystroke in the acceptance-scope ticket on every dossier, including the golden showcase screens.
  **Fix:** In the useMemo: `const n = Math.max(0, Math.min(Math.floor(Number(units) || 0), 1_000_000));` Then move the cleanPerUnit computation above the guard and return null when it is not positive: `const cleanPerUnit = Number.isFinite(pct) && pct > 0 ? (face * BigInt(Math.round(pct * 100))) / 10_000n : 0n; if (cleanPerUnit <= 0n) return null;`. That shows the existing `ticket.invalid` message instead of throwing. Optionally add `step={1}` to the Bonds TextField.

### Acceptance criteria not met
- Dossier: header with status incl. IN DEFAULT / DEMO CLOCK, Verify on-chain link, yield block (clean, accrued, dirty, YTM, current yield), LifecycleRail, schedule, terms, KASE panel and documents below the life story, trade ticket accrued split for N bonds — Everything renders: status, Defaulted chip, Demo clock chip, Verify on-chain → /proof/<mint>, the five yield rows, the rail with all actions, the schedule/actions/terms tabs, and KASE plus documents at the bottom (QPNb1 shot). Not met only because the ticket throws on fractional units or a sub-0.005% price, which crashes the page (blocking item).

Design score: 8/10
