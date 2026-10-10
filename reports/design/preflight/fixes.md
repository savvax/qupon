<<<<<<< ours
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
||||||| base
=======
# Design pre-flight fixes (task 91545 — public pages)

Rows refer to `reports/design/preflight/mechanical.md` (task 1537). After-shots: `reports/design/preflight/after/`.

- #1 /invite/[token] — removed the page's own `PublicShell` wrapper; the `(public)` layout already provides it, so the site header (logo, locale switch, CTA, sub-nav) no longer renders twice (`app/(public)/invite/[token]/page.tsx`).
- #5 /proof — the mint input's `flex-1` set flex-basis 0 in the phone column layout and collapsed it to a thin pill; now `sm:flex-1` only, so `h-11` holds at 390 (`components/proof/ProofPicker.tsx`).
- #6 /sandbox/fx-bank — not reproducible: driven at 1440/390 × en/ru/kk against mock mode with console + pageerror + dev-overlay listeners — zero errors in every locale, kk keys complete (messages parity test green). The badge was the known Next-dev SegmentTrieNode hydration artifact the sweep already tolerates (`idOnly` filter in `e2e/sweep.spec.ts`); it is dev-overlay-only, not shipped to production builds.
- #14 / (home) — the kk card title truncated mid-word; dropped `truncate` (kept `min-w-0`) so "Соңғы корпоративті әрекет" wraps to a second line instead (`app/(public)/_landing/HeroLifecycle.tsx`).
- #19 footer / network chip — slot grouping now goes through `formatGroupedInt` (`lib/format.ts`): kk keeps ru's space grouping instead of falling back to en-US commas; NetworkChip no longer hard-codes the ru-only locale map, and admin/system's bare `toLocaleString()` calls use the same helper so "288,123,456" becomes locale-aware (`components/ui/NetworkChip.tsx`, `app/(cabinet)/admin/system/SystemPanel.tsx`).
- #21 /holder/[addr] — the subtitle's "·" was its own flex item and got orphaned at the end of a wrapped line; it now travels with the note via a no-break space (`"·\u00A0"`), so it can never sit alone (`app/(public)/holder/[addr]/page.tsx`).
- #22 /sandbox/* — the header links ("Открыть страницу облигации" / "Начать заново") wrapped mid-text at 390 and pushed the "?" icon onto its own line; `whitespace-nowrap` on both links keeps each intact — the row now fits on one line, with flex-wrap as the safety net (`app/(public)/sandbox/[id]/SandboxView.tsx`).
- #23 /bonds — life-stage + demo chips wrapped inconsistently per locale (en one row, ru/kk two), so card heights differed; the chip row now always stacks at phone width (`max-sm:flex-col`), making card heights locale-independent (`app/(public)/bonds/page.tsx`).
- #31 /proof/[pda] — "Transfer-hook gate" read as mixed script in ru/kk; both now show the glossary term "Transfer hook" (the repo voice keeps the Token-2022 term in English inside ru/kk prose — see `<term>transfer hook</term>` in the sandbox copy) (`messages/{ru,kk}/proof.json`).

Re-shot with `SWEEP_ROUTES` (new env filter in `e2e/sweep.spec.ts`): /, /bonds, /holder/<addr>, /invite/[token], /proof, /proof/<mint>, /sandbox/fx-{snapshot,defaulted,bank} — 54 shots, sweep green.
>>>>>>> theirs
