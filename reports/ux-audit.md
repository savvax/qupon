# UX audit — 2026-10-06 (task 1106)

**Method.** `apps/web/e2e/ux-audit.spec.ts` (`AUDIT=1 pnpm e2e --grep @audit`) visited 34 routes × EN/RU × 1440/390 px (136 views) in mock mode on the 1104+1107 build, took full-page screenshots and measured horizontal overflow, console errors, raw message keys, English on RU pages, truncation, touch targets and h1 count. Two design reviews read every screenshot (public + investor, back office). `e2e/locale-stability.spec.ts` pins EN/RU box equality on seven key pages.

**Fixed in 1106**
- Horizontal scroll on both action detail pages (a SIMULATED sentence rendered as a no-wrap badge) — now a note; `main` clips overflow as a safety net.
- Phones: admin's 8 sections now reachable (4 tabs + "More" sheet), labels wrap instead of truncating; account reachable from every cabinet (account button in the top bar; sign-out on the account page); EN/RU switch and copy buttons ≥ 32 px targets; copy button labelled in RU.
- Locale: percents and coupon frequency follow the locale ("10,00 %", "раз в полгода"); amounts drop noise decimals (1,000.000000 USDC → 1,000.00); timeline details are messages with RU plurals ("3 держателя"); RU copy pass (до удержания налога, История начислений, Дата фиксации, Купить (DvP), Ваши голоса, Текущий итог, Открыть демо-кабинет, Платёжный агент, Индексация событий, one term "выпуск"); a non-breaking space before every em dash (146 strings) so a dash never starts a line.
- Layout: KPI tiles equal height with aligned values; stepper on one line; neutral equal-width vote buttons; full-width CTAs on phones; live strip fades at the edge; header buttons share one height; wallet label sits next to its icon; account column aligned with other pages, locale dates, neutral "Unlink"; network readiness shows "n/a on devnet" for the mainnet-only check.

**Open (task 9106)** — see tasks/todo/9106-ux-review-fixes.md.
