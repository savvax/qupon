---
id: 91548
title: design pre-flight fixes: number/date formatting and the kk glyph
agent: glm
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
- Fix rows 17, 30 and every row that mentions number/date/slot formatting or fonts: one formatting path for amounts (grouping + decimals per locale, e.g. never "2034,90" next to
  "1 000,00"), dates (no raw ISO strings in UI; one date format per locale) and slots (same grouping in ru and kk) — find the
  shared helpers (`apps/web/src/lib/format*`) and route every offender through them; add unit tests for en/ru/kk.
- Kazakh Ұ/ұ renders double-struck with the current Manrope subset: make sure the font subset includes the Kazakh
  Cyrillic letters (Ә Ғ Қ Ң Ө Ұ Ү Һ І and lowercase) — next/font `subsets` / unicode ranges — or fall back to a font that
  has them; verify on a kk shot.
- Fix the root cause in the shared component when several rows share it; do not patch per page.
- Strings: en/ru/kk must stay in strict key parity (messages.test); kk is the longest — test it at 390.
- Re-shoot only the routes you touched: `SWEEP_OUT=reports/design/preflight/after` with the sweep filtered to those routes
  (add a `SWEEP_ROUTES` env filter to sweep.spec.ts if it does not exist yet — comma-separated route list), commit the shots.
- Append to `reports/design/preflight/fixes.md` one line per row you fixed: `#<row> <route> — <what changed> (<file>)`.

## Acceptance
Every listed row fixed (or explained in fixes.md why not); `sweep.spec.ts` green in mock mode; after-shots committed; `make verify` green.
Commit `fix(web): design pre-flight — number/date formatting and the kk glyph` (`task: 91548`).

## Finish
Write `reports/worklog/91548.md` (3–6 lines), commit with `task: 91548`, print `DONE:91548` or `BLOCKED:91548 <reason>`.
