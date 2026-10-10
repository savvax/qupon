---
blocked_reason: rebase conflict with main
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

## Review feedback (round 1, 2026-10-10 20:32) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Fail: three date and number offenders remain, all small fixes. Rows 18, 19, 20 and 30 are fixed and the format tests pass (25/25). Remaining: (1) the KASE panel on /bonds/[mint] still shows raw ISO dates ('2026-10-06') in ru/kk next to 01.03.2027; (2) the UserDialog reset-link expiry calls formatDateTime with no locale (the twin of the fixed TeamPanel); (3) /admin/system shows SOL balances as '4.213 SOL' with a dot decimal in ru. Together these leave rows 17 and 32 incomplete, and fixes.md overclaims 'no ISO strings in the UI'. I took en/ru screenshots myself; for kk I used the worker's committed after-shots because the kk re-shoot was not permitted.

### Blocking
- apps/web/src/app/(public)/bonds/[mint]/KasePanel.tsx:112 — The KASE panel still shows raw ISO dates on /bonds/[mint] in ru and kk. The quote date reads "2026-10-06" and the news dates read "2026-09-18" (line 137, `it.date.slice(0, 10)`). The rest of the same page uses "01.03.2027". This is the row 17 / task 'no raw ISO strings in UI; one date format per locale' defect, in a file this task edited, and fixes.md says "no ISO strings in the UI". I saw it in the ru-1440 shot of /bonds/QpNb1Dem0BondMint1111111111111111111111111111.
  **Fix:** Import `formatDate` from `@/lib/format`. Render line 112 as `{bond.market.date ? formatDate(bond.market.date.length > 10 ? bond.market.date : `${bond.market.date}T00:00:00+05:00`, locale) : "—"}`, the same civil-date pattern page.tsx:307 uses. Replace `it.date.slice(0, 10)` on line 137 with the same `formatDate(…, locale)` call. Re-shoot /bonds/QpNb1Dem0BondMint1111111111111111111111111111 into reports/design/preflight/after.
- apps/web/src/app/(cabinet)/admin/users/UserDialog.tsx:240 — `formatDateTime(link.expiresAt)` has no locale, so the reset-link expiry renders the machine format "2026-10-10 19:13" in every locale. The worker fixed the identical invite-expiry case in TeamPanel and missed this one. That breaks the task's 'route every offender through the shared helpers' and the fixes.md #17 claim.
  **Fix:** Add `const locale = useLocale()` (from next-intl) in that component and change it to `formatDateTime(link.expiresAt, locale)`.
- apps/web/src/app/(cabinet)/admin/system/SystemPanel.tsx:164 — Operator wallet balances use `o.sol.toFixed(3)`, so ru and kk show "4.213 SOL" with a dot decimal, next to the newly fixed "288 123 456" on the same card grid. That breaks 'decimals per locale', and fixes.md #32 lists /admin/system as fixed. I saw it in the admin_system-ru-1440 shot.
  **Fix:** Add `formatDecimal(n: number, digits: number, locale?: string)` to lib/format.ts: Intl.NumberFormat with ru-RU for ru/kk and en-US otherwise, min/max fraction digits = digits. Use `t("ops.sol", { n: formatDecimal(o.sol, 3, locale) })`. Add an en/ru/kk case to format.test.ts (4.213 → "4.213" / "4,213" / "4,213").

### Acceptance criteria not met
- Row 17: audit (and neighbouring) dates go through formatDate/formatDateTime with locale; no raw ISO strings in UI — Audit, organizations and team are fixed (ru shot shows "10.10.2026, 20:25"). But KasePanel quote and news dates are still raw ISO on /bonds/[mint] ru/kk, and UserDialog reset expiry has no locale.
- Row 32: /admin/system consistent with the locale formats — Dates and slots are fixed, but the SOL balances render "4.213 SOL" in ru.

Design score: 7/10

## Review feedback (round 2, 2026-10-11 01:12) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Fail: two blocking items, both small. All three round-1 items are fixed, and my live en/ru shots at 1440 and 390 confirm them: the KASE panel shows 06.10.2026 and 18.09.2026, /admin/system shows '4,213 SOL' and '288 123 456' in ru, and the footer chip groups as 'слот 1 249'. (1) The new shared `civilDate` passes KASE datetimes that have no time zone straight through. On a UTC server, news posted at 19:38 Almaty would show the next day; the old `.slice(0,10)` was correct, so this is a regression. Fix it inside civilDate and add a test. (2) The committed after-shots were rendered from stale code: they show the old '288,123,456' and '4.213 SOL' in ru and kk, and 'слот 1,253' in the kk footer chip. So the after-shots criterion and the kk glyph check have no valid evidence. Re-shoot the touched routes from this worktree on a fresh server and commit. Design score is 8 on the live screens.

### Blocking
- apps/web/src/lib/format.ts:48 — `civilDate` returns timestamps that have no zone offset unchanged. KasePanel now feeds it raw KASE strings: news `create_datetime` like "2026-09-18T19:38:00" (the first mock and testdata item) and deal `date0` like "2026-10-05 16:59:40". `new Date()` reads these in the server's local time zone. On a UTC host (Docker or Vercel), 19:38 is read as UTC, which is 00:38 next day in Almaty, so the news line shows 19.09.2026 instead of 18.09.2026. The old `.slice(0, 10)` was right on every host; this diff makes the date wrong by a day. It only looks correct in the shots because they ran on an Almaty-time machine.
  **Fix:** In lib/format.ts, treat any string without an offset as Almaty civil time: `export function civilDate(iso: string): string { if (iso.length <= 10) return `${iso}T00:00:00+05:00`; return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso.replace(" ", "T")}+05:00`; }`. Add these to format.test.ts: `expect(formatDate(civilDate("2026-09-18T19:38:00"), "ru")).toBe("18.09.2026")`, `expect(civilDate("2026-10-05 16:59:40")).toBe("2026-10-05T16:59:40+05:00")`, and keep the existing +05:00 passthrough case.
- reports/design/preflight/after/admin-system-ru-390.jpg — The committed after-shots were rendered from stale code, so they show the defects this task claims to fix. The committed admin-system-ru-390 and admin-system-kk-390 show slot "288,123,456" and "4.213 SOL". Rendering the same route from this branch now gives "288 123 456" and "4,213 SOL". The committed bonds-…-kk-1440 footer chip reads "слот 1,253" (row 19), even though NetworkChip now uses formatInt. The shot timestamps (11.10.2026 01:00–01:01) are from round 2, so the Playwright web server was probably reused from another checkout or port. That breaks the acceptance item 'after-shots committed'. It also means kk, where the glyph (#20) must be checked, has no valid evidence.
  **Fix:** Kill any running `next dev`/`next start` and run the sweep from this worktree on a unique port. Example: `cd apps/web && E2E_PORT=3917 SWEEP_OUT=../../reports/design/preflight/after SWEEP_ROUTES=/admin/system,/admin/audit,/admin/organizations,/admin/users,/issuer/team,/registrar/reports,/investor,/bonds/QpNb1Dem0BondMint1111111111111111111111111111 pnpm exec playwright test e2e/sweep.spec.ts`. Set reuseExistingServer to false if the config honours an env flag. Before committing, open the kk-390 shots and check for 'слот 1 2xx' in the chip, '288 123 456', '4,213 SOL', KASE dates like 06.10.2026, and Ұ/ұ in the same face as the surrounding text. Commit the regenerated JPGs and index.md.

### Acceptance criteria not met
- No raw ISO strings and one date format per locale (row 17), with no date regressions — Raw ISO strings are gone. But civilDate passes offset-less KASE datetimes through, so the news and deal dates shift a day on a UTC server (see blocking item 1).
- kk glyph (#20): Manrope subset includes the Kazakh letters, verified on a kk shot — layout.tsx keeps subsets ['latin','cyrillic','cyrillic-ext'] (U+0460-052F covers Ұ U+04B0). The only kk evidence is the stale committed shots, and shots.sh did not shoot kk (it found no '"kk"' in request.ts).
- After-shots committed for the touched routes — The files are committed but show pre-fix output ('288,123,456', '4.213 SOL' in ru and kk; 'слот 1,253' in kk). See blocking item 2.

Design score: 8/10
