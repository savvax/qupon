---
id: 91546
title: design pre-flight fixes: admin and print reports
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
- Fix rows 2, 7, 8, 9, 10, 12, 20, 24, 25, 32 of mechanical.md (admin cabinet: users actions cell at 390, audit, organizations, series, system;
  print reports: tables clipped at 390, raw enums like `individual` / `INTR` untranslated in ru/kk — translate them through
  the messages files, never hard-code).
- Fix the root cause in the shared component when several rows share it; do not patch per page.
- Strings: en/ru/kk must stay in strict key parity (messages.test); kk is the longest — test it at 390.
- Re-shoot only the routes you touched: `SWEEP_OUT=reports/design/preflight/after` with the sweep filtered to those routes
  (add a `SWEEP_ROUTES` env filter to sweep.spec.ts if it does not exist yet — comma-separated route list), commit the shots.
- Append to `reports/design/preflight/fixes.md` one line per row you fixed: `#<row> <route> — <what changed> (<file>)`.

## Acceptance
Every listed row fixed (or explained in fixes.md why not); `sweep.spec.ts` green in mock mode; after-shots committed; `make verify` green.
Commit `fix(web): design pre-flight — admin and print reports` (`task: 91546`).

## Finish
Write `reports/worklog/91546.md` (3–6 lines), commit with `task: 91546`, print `DONE:91546` or `BLOCKED:91546 <reason>`.

## Review feedback (round 1, 2026-10-10 20:22) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Most of the assigned rows (2, 8, 9, 12, 20, 24, 25, 32) are fixed cleanly in the shared components. Message parity holds (web unit tests 264/264 pass), and the SWEEP_ROUTES filter and after-shots are committed. It fails the design gate (score 7) on three concrete defects in touched screens. (1) The /admin/audit Apply button (and the /admin/users filter button) uses the non-existent `bg-p600` token and is invisible, so row 10's fix claim does not hold. (2) The new print scroll hint uses n400 at 10px on white, which is below AA per language.md §4. (3) /print/payouts in ru at 1440 still clips the 'Корпоративное действие' header with no affordance. Each fix is a one-line class change. The filtered sweep spec could not be re-run here (env-prefixed commands were denied); the orchestrator's verify passed.

### Blocking
- apps/web/src/app/(cabinet)/admin/audit/page.tsx:217 — Row 10 is not fully fixed. The Apply submit button uses `bg-p600 hover:bg-p700`, but `p600` is not a token: globals.css defines only p50/100/300/500/700/800/900. The button renders with a transparent background and white text, so it is invisible at both 390 and 1440 in every locale (screenshots show the 'All' select followed by empty space). fixes.md says 'Result select + Apply span the phone grid', but Apply cannot be seen. /admin/users (apps/web/src/app/(cabinet)/admin/users/page.tsx:190, a route in this task) has the same invisible filter button.
  **Fix:** In both files, replace the raw `<button type="submit" className="… bg-p600 … hover:bg-p700">` with the shared `<Button type="submit">{t("apply")}</Button>` from `@/components/ui/Button` (primary variant, which uses g600 per language.md §4). Keep `shrink-0` on the audit button. Then re-shoot /admin/audit and /admin/users into reports/design/preflight/after.
- apps/web/src/app/(print)/print/[report]/page.tsx:254 — The new phone scroll hint is `text-[10px] text-n400` on the white card. n400 (#9aa7a0) is about 2.4:1 on white. docs/design/language.md §4 requires n500 or darker for small text on white cards (4.56:1), so this new element fails AA.
  **Fix:** Change the hint's classes to `mt-4 text-[11px] text-n500 sm:hidden print:hidden`.
- apps/web/src/app/(print)/print/[report]/page.tsx:294 — /print/payouts in ru at 1440 still clips the table at the card edge. The last header 'Корпоративное действие' is cut after 'Корпоративное' and there is no scroll hint at that width (the hint is `sm:hidden`). This is row 7's defect (table wider than the card, no affordance) on a screen the task requires to look finished at 1440.
  **Fix:** Remove `whitespace-nowrap` from the payouts `<th>` className (L294, so it becomes `px-1 py-1.5 font-semibold align-bottom`) so long headers wrap to two lines; the td cells keep their nowrap. Re-shoot print/payouts ru/kk 1440 and confirm the header is fully visible with no inner scroll.

### Acceptance criteria not met
- Row 7 print tables not clipped / have scroll affordance — 390: hint plus an inner scroll box, OK. ru 1440 /print/payouts still clips the 'Корпоративное действие' header with no affordance
- Row 10 audit Result select shows label at 390 — Select now shows 'Все', but its Apply button is invisible (bg-p600 is not a token) at 390 and 1440

Design score: 7/10
