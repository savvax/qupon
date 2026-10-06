---
id: 9106
title: UX review fixes, round 2 (phone tables, action page by type, pipeline, investor structure, dates)
agent: claude
tier: T1
depends_on: [1106]
verify: make verify
timeout_min: 150
---
## Goal
Fix the open items of the 2026-10-06 design review (reports/ux-audit.md). EN + RU, reduced motion respected, `e2e/locale-stability.spec.ts` stays green.

## Items
1. **Phone tables**: `DataTable` below 640 px renders stacked cards (header → value pairs) that keep every column marked `essential` (investor entitlement history + statements: amount, status, tx/download; registrar investors: tax; admin assets: authorities). No hidden key column on phones.
2. **Action detail by kind**: a BMET (meeting) page shows no coupon-only cards (KASE schedule check, seev.036, coupon notice); its holder list is titled "Holders/Держатели"; remove the grey "Action completed" box (the status pill says it); balance the two columns (Facts/Reconcile under the timeline on desktop, or a sticky right column).
3. **Registrar dashboard**: phone → pipeline as a vertical list grouped by stage; desktop → card min-width 200 px, dates `nowrap`, pills never overflow cards, "—" in empty columns; the record-date alert wraps instead of truncating.
4. **Activity / autopilot**: phone activity rows = two lines (event + time / series + tx); autopilot shows a human step label ("Strike record date"), the ticker (not the mint) and the CLI command in a collapsed `<code>` block.
5. **Investor cabinet**: H1 = section name (Portfolio, Placement, Meetings, Statements) with the wallet/DEMO as a sub-line; meeting "voting ends" shows the time zone (Almaty); statements download label "Download/Скачать" instead of "seev.036".
6. **Dates**: every user-facing date goes through one locale formatter (RU "01.03.2027", EN "Mar 1, 2027") — bond schedule cards ("Купон 1 · 01.03.2027"), statements, entitlements, pipeline.
7. **Issuer**: series detail action rows are links styled like elsewhere; wizard puts Rate, Frequency and Day count in one 3-column row.
8. **Login / 404 / landing**: login panels equal height and no header "Sign in" on /login; 404 gets an h1 and a solid border; landing audience CTAs share one style; header nav gaps uniform.
9. **Admin**: users breakdown never breaks "Issuer · 2" (nbsp); system page pills are statuses only and the Low pill does not push the balance to a new line; assets table: symbol does not wrap.

## Acceptance criteria
- Each item done; e2e added where an item changes behaviour (DataTable phone cards, BMET page without coupon cards, autopilot labels); ux-audit re-run shows no hScroll; `make verify` green; reports/worklog/9106.md.
