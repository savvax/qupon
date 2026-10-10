# Design pre-flight fixes

One line per fixed row. Task 91545: rows 1, 5, 6, 14, 19, 21, 22, 23, 31 (public pages).
Task 91546: rows 2, 7, 8, 9, 10, 12, 20, 24, 25, 32 (cabinet/print pages). After-shots: `reports/design/preflight/after/`.
One line per fixed row. Task 91546: rows 2, 7, 8, 9, 10, 12, 20, 24, 25, 32. Task 91548: rows 17, 18, 19, 20, 30, 32.

## Task 91545 — public pages

- #1 /invite/[token] — removed the page's own `PublicShell` wrapper; the `(public)` layout already provides it, so the site header (logo, locale switch, CTA, sub-nav) no longer renders twice (`app/(public)/invite/[token]/page.tsx`).
- #5 /proof — the mint input's `flex-1` set flex-basis 0 in the phone column layout and collapsed it to a thin pill; now `sm:flex-1` only, so `h-11` holds at 390 (`components/proof/ProofPicker.tsx`).
- #6 /sandbox/fx-bank — not reproducible: driven at 1440/390 × en/ru/kk against mock mode with console + pageerror + dev-overlay listeners — zero errors in every locale, kk keys complete (messages parity test green). The badge was the known Next-dev SegmentTrieNode hydration artifact the sweep already tolerates (`idOnly` filter in `e2e/sweep.spec.ts`); it is dev-overlay-only, not shipped to production builds.
- #14 / (home) — the kk card title truncated mid-word; dropped `truncate` (kept `min-w-0`) so "Соңғы корпоративті әрекет" wraps to a second line instead (`app/(public)/_landing/HeroLifecycle.tsx`).
- #19 footer / network chip — slot grouping now goes through `formatGroupedInt` (`lib/format.ts`): kk keeps ru's space grouping instead of falling back to en-US commas; NetworkChip no longer hard-codes the ru-only locale map, and admin/system's bare `toLocaleString()` calls use the same helper so "288,123,456" becomes locale-aware (`components/ui/NetworkChip.tsx`, `app/(cabinet)/admin/system/SystemPanel.tsx`).
- #21 /holder/[addr] — at phone width the note now starts its own line with no leading separator: the "·" is hidden below sm (`max-sm:hidden`) and the note takes the full row (`max-sm:basis-full`), so no wrapped line ever starts with "·" (`app/(public)/holder/[addr]/page.tsx`).
- #22 /sandbox/* — at ru 390 the row (~355 px in 358 px) still wrapped and dropped "?" alone; the restart link and HelpMenu are now grouped in one `inline-flex items-center whitespace-nowrap` span, so "?" always shares a line with "Начать заново" — the row may wrap between the two groups, never inside (`app/(public)/sandbox/[id]/SandboxView.tsx`).
- #23 /bonds — life-stage + demo chips wrapped inconsistently per locale (en one row, ru/kk two), so card heights differed; the chip row now always stacks at phone width (`max-sm:flex-col`), making card heights locale-independent (`app/(public)/bonds/page.tsx`).
- #31 /proof/[pda] — "Transfer-hook gate" read as mixed script in ru/kk; both now show the glossary term "Transfer hook" (the repo voice keeps the Token-2022 term in English inside ru/kk prose — see `<term>transfer hook</term>` in the sandbox copy) (`messages/{ru,kk}/proof.json`).

## Task 91546 — cabinet/print pages

- #2 /admin/users — actions cell is `flex min-w-0 flex-wrap` so "Reset link"/"Edit user" wrap instead of overlapping the label at 390 (`apps/web/src/app/(cabinet)/admin/users/UserDialog.tsx`)
- #7 /print/holders, /print/payouts — phone card padding 16 px (`p-4 sm:p-8`) plus a visible swipe hint above the scroll box (`reports.print.scrollHint`, en/ru/kk) (`apps/web/src/app/(print)/print/[report]/page.tsx`, `apps/web/messages/{en,ru,kk}/reports.json`)
- #8 /print/holders, /print/payouts — raw enums translated through new `reports.types` / `reports.residencies` / `reports.kinds` message keys (same vocabulary as registrar tables), raw value kept as fallback (`apps/web/src/app/(print)/print/[report]/page.tsx`, `apps/web/messages/{en,ru,kk}/reports.json`)
- #9 /print/payouts — bank sub-line moved to its own colSpan row, `whitespace-nowrap` on the Action cell, summary rows `flex-wrap` so values never squeeze into a narrow column (`apps/web/src/app/(print)/print/[report]/page.tsx`)
- #10 /admin/audit — Result select + Apply span the phone grid (`col-span-2 md:col-span-1`), so the select shows its "All" label at 390 (`apps/web/src/app/(cabinet)/admin/audit/page.tsx`)
- #12 /admin/*, /registrar/* — bottom-nav label slot reserves two lines (`min-h-[2lh]`), wrapped ru/kk labels keep their icon on the same baseline (shared CabinetShell; also covers #11) (`apps/web/src/components/shell/CabinetShell.tsx`)
- #20 Kazakh Ұ/ұ — Manrope now loads the `cyrillic-ext` subset (Қ/қ, Ә/ә, Ұ/ұ no longer fall back mid-word) (`apps/web/src/app/layout.tsx`)
- #24 /admin/series — "KASE ticker" label uses the Select label typography (13 px semibold n700), baselines match (`apps/web/src/app/(cabinet)/admin/series/SeriesRowControls.tsx`)
- #25 /admin — KPI grid `auto-rows-fr` (equal row heights), kk hint reworded to "тексеру: SIMULATED" (`apps/web/src/app/(cabinet)/admin/page.tsx`, `apps/web/messages/kk/admin.json`)
- #32 /admin/system — header already used `formatDateTime(…, locale)`; the mismatch came from the audit page's locale-less call, now locale-aware (shared with #17, task 91548) (`apps/web/src/app/(cabinet)/admin/audit/page.tsx`)

### Round 1 review fixes (2026-10-10)

- #10 /admin/audit, /admin/users — Apply used non-existent `bg-p600` (invisible); both filters now use the shared `<Button>` primary (g600) — verified computed bg `rgb(2,138,41)` at 390 (`apps/web/src/app/(cabinet)/admin/{audit,users}/page.tsx`)
- #7 /print/* — scroll hint bumped to `text-[11px] text-n500` (AA on white per language.md §4) (`apps/web/src/app/(print)/print/[report]/page.tsx`)
- #7 /print/payouts — payouts `<th>` lost `whitespace-nowrap` (`align-bottom` instead), long ru/kk headers wrap to two lines instead of clipping at the card edge; ru 1440 table now exactly fits the card (`apps/web/src/app/(print)/print/[report]/page.tsx`)
- #21 /holder/[addr] — round 1 left "·" leading the wrapped line at ru 390; fixed per review with the `max-sm:hidden` separator + `max-sm:basis-full` note (see above) (`apps/web/src/app/(public)/holder/[addr]/page.tsx`)
- #22 /sandbox/* — round 1's `whitespace-nowrap` per link was not enough in ru (row still wrapped, "?" alone); fixed per review by grouping restart + HelpMenu in one nowrap inline-flex span (see above) (`apps/web/src/app/(public)/sandbox/[id]/SandboxView.tsx`)

Re-shots: task 91545 used `SWEEP_ROUTES` (env filter in `e2e/sweep.spec.ts`) on /, /bonds, /holder/&lt;addr&gt;, /invite/[token], /proof, /proof/&lt;mint&gt;, /sandbox/fx-{snapshot,defaulted,bank}; round 1 re-shot /holder/&lt;addr&gt; (ru, kk) and /sandbox/fx-{snapshot,defaulted,bank} (ru) at 390, sweep green.
- #10 /admin/audit, /admin/users — Apply used non-existent `bg-p600` (invisible); both filters now use the shared `<Button>` primary (g600) — verified computed bg `rgb(2,138,41)` at 390 (apps/web/src/app/(cabinet)/admin/{audit,users}/page.tsx)
- #7 /print/* — scroll hint bumped to `text-[11px] text-n500` (AA on white per language.md §4) (apps/web/src/app/(print)/print/[report]/page.tsx)
- #7 /print/payouts — payouts `<th>` lost `whitespace-nowrap` (`align-bottom` instead), long ru/kk headers wrap to two lines instead of clipping at the card edge; ru 1440 table now exactly fits the card (apps/web/src/app/(print)/print/[report]/page.tsx)
## Task 91548 (2026-10-10)
One line per mechanical.md row fixed. Task 91548 (rows 17, 18, 19, 20, 30 + 32).
- #17 /admin/audit, /admin/organizations, /issuer/team — audit rows, org table and invite-expiry now render through `formatDate(Time)(iso, locale)`; no ISO strings in the UI (native `<input type="date">` placeholders stay browser-formatted — not controllable per page locale) (`apps/web/src/app/(cabinet)/admin/audit/page.tsx`, `admin/organizations/page.tsx`, `issuer/team/TeamPanel.tsx`)
- #18 /investor, /bonds/[mint] — amounts already share one grouped path (`lib/ui/amount.ts` via `<Amount>`; verified against rendered ru text: "2 034,90", "10 000,00"); the actual mixed-separator offenders were raw `toFixed` percentages — YTM, current yield, YTM-to-maturity, KASE price/bid/offer and register shares now go through `bpsToPercent(…, locale)` (kk case added to the amount tests) (`HoldingsList.tsx`, `YieldBlock.tsx`, `KasePanel.tsx`, `RegisterPanel.tsx`)
- #19 footer chip, /admin/system, /bonds/[mint], /registrar/reports — new `formatInt(n, locale)` in `lib/format.ts` (kk groups like ru, never "1,249"); NetworkChip no longer maps kk→en-US, SystemPanel slots/entries no longer use bare `toLocaleString()` (`NetworkChip.tsx`, `SystemPanel.tsx`, `bonds/[mint]/page.tsx`, `registrar/reports/page.tsx`)
- #20 kk glyph — Manrope now also loads the `cyrillic-ext` subset (Ә Ғ Қ Ң Ө Ү Һ; Ұ and І were already in `cyrillic`): the served CSS carries `U+0460-052F` and kk after-shots render in one face (`apps/web/src/app/layout.tsx`)
- #30 /ui — dev-only primitive gallery stays English on purpose; excluded from the ru/kk sweep (en shots only) (`apps/web/e2e/sweep.spec.ts`)
- #32 /admin/system — same root cause as #17: header time already used `formatDateTime(…, locale)`, slots fixed under #19
## Task 91548 — review round 1 (2026-10-11)
- #17 /bonds/[mint] — KASE panel quote date, news dates and deal chips render `formatDate(civilDate(…), locale)` — no raw ISO strings remain on the page; the dossier's local `day()` helper now aliases the shared `civilDate` (`KasePanel.tsx`, `bonds/[mint]/page.tsx`, `lib/format.ts`)
- #17 /admin/users — reset-link expiry is `formatDateTime(link.expiresAt, locale)` (the twin of the fixed TeamPanel invite expiry) (`UserDialog.tsx`)
- #32 /admin/system — operator SOL balances go through new `formatDecimal(o.sol, 3, locale)`: "4.213" en / "4,213" ru·kk, matching the slot grouping on the same card (`SystemPanel.tsx`, `lib/format.ts`)
