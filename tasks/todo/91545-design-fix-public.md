---
id: 91545
title: design pre-flight fixes: public pages
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
- Fix rows 1, 5, 6, 14, 19, 21, 22, 23, 31 of mechanical.md (public pages: /invite, /proof picker, /sandbox (kk dev-issue badge on fx-bank — find and
  fix the runtime error or missing kk key), landing, footer/network chip, /holder, /bonds, /proof/<mint>).
- Fix the root cause in the shared component when several rows share it; do not patch per page.
- Strings: en/ru/kk must stay in strict key parity (messages.test); kk is the longest — test it at 390.
- Re-shoot only the routes you touched: `SWEEP_OUT=reports/design/preflight/after` with the sweep filtered to those routes
  (add a `SWEEP_ROUTES` env filter to sweep.spec.ts if it does not exist yet — comma-separated route list), commit the shots.
- Append to `reports/design/preflight/fixes.md` one line per row you fixed: `#<row> <route> — <what changed> (<file>)`.

## Acceptance
Every listed row fixed (or explained in fixes.md why not); `sweep.spec.ts` green in mock mode; after-shots committed; `make verify` green.
Commit `fix(web): design pre-flight — public pages` (`task: 91545`).

## Finish
Write `reports/worklog/91545.md` (3–6 lines), commit with `task: 91545`, print `DONE:91545` or `BLOCKED:91545 <reason>`.

## Review feedback (round 1, 2026-10-10 20:45) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Seven of the nine rows are properly fixed: invite header, proof input, the fx-bank kk badge (explained as not reproducible), home kk title, locale-aware slot grouping, bonds chips and the proof label. Row 22 is not fixed in ru at 390: the help \"?\" still wraps onto its own line, although fixes.md says it was fixed. Row 21 is only half fixed: at 390 the holder note's line still starts with \"·\". Both need small markup changes and re-shoots. design_score 7.

### Blocking
- apps/web/src/app/(public)/sandbox/[id]/SandboxView.tsx:490 — Row 22 is not fixed in the locale it names. In the ru 390 after-shot (reports/design/preflight/after/sandbox-fx-bank-ru-390.jpg) the help "?" still drops onto its own line under "Открыть страницу облигации / Начать заново". `whitespace-nowrap` keeps each link whole, but the row (~355 px of content in 358 px) still wraps, and it wraps before the icon. fixes.md says "the row now fits on one line", which is wrong for ru. kk does fit.
  **Fix:** Keep the icon with the last link. Wrap the restart <Link> and <HelpMenu role="sandbox" /> in `<span className="inline-flex items-center gap-x-3 whitespace-nowrap">…</span>` so that "?" can never sit alone on a line. Re-shoot /sandbox/fx-bank, /sandbox/fx-snapshot and /sandbox/fx-defaulted in ru at 390 and confirm, then correct the #22 line in fixes.md.
- apps/web/src/app/(public)/holder/[address]/page.tsx:234 — Row 21 is only half fixed. At ru 390 the note still wraps onto its own line, and that line now starts with "· публичный поиск держателя — без входа". The row lists this as its second symptom: a lowercase sentence after a leading dot. The "·" is no longer orphaned, but it now leads the wrapped line.
  **Fix:** Hide the separator at phone width so the note sits on its own line without it: `<span><span aria-hidden className="max-sm:hidden">· </span>{t("subtitle")}</span>`. Optionally add `max-sm:basis-full` on that span. Re-shoot /holder/<addr> in ru and kk at 390.

### Acceptance criteria not met
- Row 21 /holder subtitle separator — At ru 390 the wrapped line starts with "· публичный поиск…". The row's second symptom remains.
- Row 22 /sandbox header "?" on its own line at ru 390 — after/sandbox-fx-bank-ru-390.jpg still shows the "?" alone on the next line.

Design score: 7/10
