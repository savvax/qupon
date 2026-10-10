# Design pre-flight fixes (mechanical.md rows)

One line per fixed row. Task 91546: rows 2, 7, 8, 9, 10, 12, 20, 24, 25, 32.

- #2 /admin/users — actions cell is `flex min-w-0 flex-wrap` so "Reset link"/"Edit user" wrap instead of overlapping the label at 390 (apps/web/src/app/(cabinet)/admin/users/UserDialog.tsx)
- #7 /print/holders, /print/payouts — phone card padding 16 px (`p-4 sm:p-8`) plus a visible swipe hint above the scroll box (`reports.print.scrollHint`, en/ru/kk) (apps/web/src/app/(print)/print/[report]/page.tsx, apps/web/messages/{en,ru,kk}/reports.json)
- #8 /print/holders, /print/payouts — raw enums translated through new `reports.types` / `reports.residencies` / `reports.kinds` message keys (same vocabulary as registrar tables), raw value kept as fallback (apps/web/src/app/(print)/print/[report]/page.tsx, apps/web/messages/{en,ru,kk}/reports.json)
- #9 /print/payouts — bank sub-line moved to its own colSpan row, `whitespace-nowrap` on the Action cell, summary rows `flex-wrap` so values never squeeze into a narrow column (apps/web/src/app/(print)/print/[report]/page.tsx)
- #10 /admin/audit — Result select + Apply span the phone grid (`col-span-2 md:col-span-1`), so the select shows its "All" label at 390 (apps/web/src/app/(cabinet)/admin/audit/page.tsx)
- #12 /admin/*, /registrar/* — bottom-nav label slot reserves two lines (`min-h-[2lh]`), wrapped ru/kk labels keep their icon on the same baseline (shared CabinetShell; also covers #11) (apps/web/src/components/shell/CabinetShell.tsx)
- #20 Kazakh Ұ/ұ — Manrope now loads the `cyrillic-ext` subset (Қ/қ, Ә/ә, Ұ/ұ no longer fall back mid-word) (apps/web/src/app/layout.tsx)
- #24 /admin/series — "KASE ticker" label uses the Select label typography (13 px semibold n700), baselines match (apps/web/src/app/(cabinet)/admin/series/SeriesRowControls.tsx)
- #25 /admin — KPI grid `auto-rows-fr` (equal row heights), kk hint reworded to "тексеру: SIMULATED" (apps/web/src/app/(cabinet)/admin/page.tsx, apps/web/messages/kk/admin.json)
- #32 /admin/system — header already used `formatDateTime(…, locale)`; the mismatch came from the audit page's locale-less call, now locale-aware (shared with #17, task 91548) (apps/web/src/app/(cabinet)/admin/audit/page.tsx)

## Round 1 review fixes (2026-10-10)

- #10 /admin/audit, /admin/users — Apply used non-existent `bg-p600` (invisible); both filters now use the shared `<Button>` primary (g600) — verified computed bg `rgb(2,138,41)` at 390 (apps/web/src/app/(cabinet)/admin/{audit,users}/page.tsx)
- #7 /print/* — scroll hint bumped to `text-[11px] text-n500` (AA on white per language.md §4) (apps/web/src/app/(print)/print/[report]/page.tsx)
- #7 /print/payouts — payouts `<th>` lost `whitespace-nowrap` (`align-bottom` instead), long ru/kk headers wrap to two lines instead of clipping at the card edge; ru 1440 table now exactly fits the card (apps/web/src/app/(print)/print/[report]/page.tsx)
