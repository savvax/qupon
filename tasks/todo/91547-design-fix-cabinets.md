---
id: 91547
title: design pre-flight fixes: investor, issuer and registrar cabinets
agent: claude
tier: T1
depends_on: [91539]
verify: make verify
timeout_min: 180
---
## Goal
Task 1537 (design pre-flight) found mechanical UI defects; fix your slice so every screen looks finished in en/ru/kk at 1440 and 390.

## Read first
- `reports/design/preflight/mechanical.md` — the defect table (task 1537 pre-flight, mechanical part). Each row has the
  route, locale/width, the defect, the likely source file and a suggested fix. The screenshots it refers to are in
  `reports/design/preflight/before/` (`<route-slug>-<locale>-<width>.jpg`, index in `index.md`).
- `docs/design/language.md` (tokens, spacing, type) — fixes must use the design system, not one-off styles.
- `apps/web/e2e/sweep.spec.ts` (task 91539: `SWEEP_OUT=<dir>` writes shots; routes, locales en/ru/kk, widths 1440/390).

## Do
- Fix rows 3, 4, 11, 13, 15, 16, 18, 26, 27, 28, 29 of mechanical.md (issuer new-series wizard fieldset `min-w-0`, investor meeting vote buttons at 390,
  issuer pages, investor reports, cabinet shells, registrar KYC/dashboard, NowBar). Do NOT touch
  `apps/web/src/app/(cabinet)/registrar/actions/**` (task 1534 rebuilds the console).
- Fix the root cause in the shared component when several rows share it; do not patch per page.
- Strings: en/ru/kk must stay in strict key parity (messages.test); kk is the longest — test it at 390.
- Re-shoot only the routes you touched: `SWEEP_OUT=reports/design/preflight/after` with the sweep filtered to those routes
  (add a `SWEEP_ROUTES` env filter to sweep.spec.ts if it does not exist yet — comma-separated route list), commit the shots.
- Append to `reports/design/preflight/fixes.md` one line per row you fixed: `#<row> <route> — <what changed> (<file>)`.

## Acceptance
Every listed row fixed (or explained in fixes.md why not); `sweep.spec.ts` green in mock mode; after-shots committed; `make verify` green.
Commit `fix(web): design pre-flight — investor, issuer and registrar cabinets` (`task: 91547`).

## Finish
Write `reports/worklog/91547.md` (3–6 lines), commit with `task: 91547`, print `DONE:91547` or `BLOCKED:91547 <reason>`.

## Review feedback (round 1, 2026-10-10 20:29) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Fail. Seven of the eleven rows are fixed (#4, #11, #15, #18, #26, #28, #29), and web unit tests pass (264). Four rows are not. #16 got worse: the one-row NowBar is now about 235–250 px tall at 390 in ru/kk, with titles and descriptions wrapped into a column about 90 px wide, and dock plus nav is taller than the new 12rem padding. #27 is still clipped because Badge's base `whitespace-nowrap`/`h-6` beat the className passed in (cx does no merging). #3 still clips the 'Paste a term sheet (experimental)' trigger in ru/kk at 390. #13 still cuts the last tab with no fade or snap. fixes.md and the worklog claim all four are done. Design score 5.

### Blocking
- apps/web/src/components/ui/NowBar.tsx:59 — Row 16 regressed instead of being fixed. Forcing `flex-row` on phones squeezes the title into a column about 90 px wide. On /investor/meetings ru 390 the docked bar grew from about 148 px (before shot) to about 235 px; kk is about 250 px and en about 230 px. On /registrar/kyc ru 390 the description wraps one word per line over 6 lines. With the 64 px nav the dock is about 300 px, more than the new 12rem (192 px) body padding, so the end of the page is still covered. The worklog says the phone dock is about 96 px; the screenshots show otherwise.
  **Fix:** Below md, put the bar in two rows. Root: `flex flex-wrap items-center gap-x-3 gap-y-2 md:flex-nowrap`. Left block (pill + title): `max-md:basis-full`. Title `<p>`: `max-md:line-clamp-2`. Detail span: `max-md:hidden` (keep the clock, inline with `max-md:flex-row`). Actors+action wrapper: `max-md:w-full max-md:justify-between`. Target: docked bar ≤ 8rem (128 px) at 390 in kk on /investor/meetings, /registrar/kyc and /issuer/series/new, so 8rem bar + 4rem nav = the existing 12rem padding in globals.css. Re-shoot those routes into after/ and correct the #16 line in fixes.md and the worklog.
- apps/web/src/components/ui/Badge.tsx:27 — Row 27 is not fixed. In the committed after-shot registrar-kk-1440.jpg, 'Облигация ұстаушылары' still runs past the board card edge. `cx` only joins strings (no tailwind-merge), so the base `h-6 whitespace-nowrap` stays next to the `h-auto whitespace-normal` that Pipeline passes in, and nowrap wins in CSS order.
  **Fix:** Replace the className override with a `wrap?: boolean` prop on Badge. When set, swap the base `h-6 whitespace-nowrap` for `min-h-6 max-w-full py-0.5 text-left leading-snug whitespace-normal` (do not append both). Use `<Badge tone="info" wrap>` in Pipeline.tsx:49. Re-shoot /registrar kk 1440 and confirm the chip wraps inside the card.
- apps/web/src/app/(cabinet)/issuer/series/new/TermsheetDialog.tsx:106 — Row 3 is only half fixed. The fieldset and Import row now fit, but the ghost 'Paste a term sheet (experimental)' trigger, which the row names explicitly, still overflows. In ru 390 it is clipped at the viewport ('…(экспериментальн'); in kk 390 it runs past the fieldset border. fixes.md says the row is fixed.
  **Fix:** Make the trigger fit the fieldset's content width of about 326 px. Either let it wrap (`max-w-full h-auto py-2 whitespace-normal text-left`, applied inside Button.tsx because cx cannot override its nowrap), or render the '(experimental)' part as a separate `text-xs text-n500` line under a shorter button label (same keys in en/ru/kk). Re-shoot /issuer/series/new ru and kk 390.
- apps/web/src/components/ui/Tabs.tsx:24 — Row 13 is only partly fixed. Labels no longer wrap, but on /issuer/series/[mint] ru 390 the last tab is still cut in half ('Держат') with no fade, snap or arrow, which is the exact defect in the row. fixes.md does not explain why this was skipped.
  **Fix:** On the TabsPrimitive.List add `snap-x scroll-px-1` and an edge fade below sm (`max-sm:[mask-image:linear-gradient(to_right,black_85%,transparent)]`). Add `snap-start` to the triggers. Or, below sm, make the list `w-full` and the triggers `flex-1 px-2` so every tab fits. Re-shoot /issuer/series/QpNb1Dem0BondMint1111111111111111111111111111 en/ru/kk 390.

### Acceptance criteria not met
- Row 3 (/issuer/series/new fieldset at 390) — Fieldset has min-w-0 and the Import row wraps, but in issuer_series_new-ru-390.png the term-sheet trigger is still clipped at the right edge, and in after/issuer-series-new-kk-390.jpg it overflows the fieldset.
- Row 13 (issuer series tabs) — whitespace-nowrap and overflow-x-auto were added, but the last tab is still cut ('Держат') at ru 390 with no fade or snap.
- Row 16 (NowBar plus nav covering content at 390) — The one-row layout made the phone dock taller: ru meetings bar about 235 px, up from about 148 px; registrar/kyc description wraps one word per line. Dock plus nav is about 300 px against 192 px of body padding.
- Row 27 (registrar board chip clipping, kk 1440) — after/registrar-kk-1440.jpg still shows 'Облигация ұстаушылары' past the card edge, because Badge's base whitespace-nowrap beats the passed className (cx has no merge).

Design score: 5/10

## Review feedback (round 2, 2026-10-11 01:16) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Fail. Ten of eleven rows are fixed and confirmed in screenshots: #3, #4, #11, #13, #16, #18, #26, #27, #28 and #29. All four round-1 blockers are resolved: the phone NowBar is two rows and about 120 px, the term-sheet trigger wraps, Tabs snap with a fade, and Badge/Button `wrap` swap their base classes instead of appending. Row 15 is not fixed. The /investor/reports Payout statement table still overflows its card at 1440 in en, ru and kk, and fixes.md wrongly says it fits. Hiding the `action` column below 2xl fixes it. Web unit tests pass (264). Design score 7.

### Blocking
- apps/web/src/app/(cabinet)/investor/reports/page.tsx:197 — Row 15 is still not fixed. At 1440 px the Payout statement table is still wider than its card in every locale, even though `units` is now hidden below 2xl. In my en-1440 shot the last column is cut to 'Actn…1'. In ru-1440 the whole Action ('ДЕЙСТВИЕ') column is pushed out of view. In the worker's own after/investor-reports-kk-1440.jpg, 'Actn…1111' ends flush on the card border and its copy icon is cut off; the Tax certificate table below it shows that icon. fixes.md says 'the kk table fits 1440 px', which the shots contradict.
  **Fix:** In the Payout statement column list, change the `action` column from `hideBelow: "lg"` to `hideBelow: "2xl"`. It only links to the corporate-action account, and the essential `tx` column stays. Keep `units` at 2xl. Re-shoot /investor/reports in en, ru and kk at 1440. Check that Payout TX is the last column, its copy icon is fully inside the card, and there are at least 16 px of right padding. Then correct the #15 line in fixes.md and the worklog.

### Acceptance criteria not met
- Row 15: /investor/reports table fits at kk 1440 — The Action column is still clipped: 'Actn…1' in en-1440, gone completely in ru-1440, and missing its copy icon in kk-1440.

Design score: 7/10

## Review feedback (round 3, 2026-10-11 01:49) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Fail on one item. The round-2 blocker (row 15) is fixed: in ru-1440 the Payout statement table ends on TX with the copy icon inside the card, and the other rows hold up in screenshots. Design score is 8. But the web unit suite is red at HEAD. The branch changed formatAmount's ru/kk group separator from U+202F to NBSP, rewrote the RU test to match, and left 91548's merged 'KK groups like RU' test (amount.test.ts:24) failing. Revert amount.ts and amount.test.ts to the base, drop the NBSP claim from fixes.md and the worklog, then re-run the tests.

### Blocking
- apps/web/src/lib/ui/amount.ts:13 — `pnpm --filter web test` fails at HEAD: 1 failed, 268 passed. The failing test is src/lib/ui/amount.test.ts:24 'KK groups like RU, never a comma (pre-flight #18/#19)', which expects '10 000,00' and '2 034,90'. This test comes from merged task 91548. This branch changed formatAmount's ru/kk group separator from U+202F to NBSP (U+00A0) and rewrote the RU assertion at line 18 to match, but left 91548's KK test red. Rewriting one test to fit and breaking another is a test regression. It also overrides row #18/#19, which 91548 already fixed and got reviewed.
  **Fix:** Revert apps/web/src/lib/ui/amount.ts and apps/web/src/lib/ui/amount.test.ts to the base (`git checkout c17d88a0 -- apps/web/src/lib/ui/amount.ts apps/web/src/lib/ui/amount.test.ts`) so main's U+202F grouping and its tests stand. You may keep the `useGrouping: "always"` additions in format.ts and kyc.ts. Remove the formatAmount/NBSP claim from the #18 line in fixes.md and from the worklog. Re-run `pnpm --filter web test`; it must be 0 failed.

### Acceptance criteria not met
- Row 18 fixed without breaking other tests — The amount.ts separator change fails 91548's KK grouping test (amount.test.ts:24).
- Web unit tests and `make verify` green — pnpm --filter web test: Tests 1 failed | 268 passed | 1 skipped.

Design score: 8/10
