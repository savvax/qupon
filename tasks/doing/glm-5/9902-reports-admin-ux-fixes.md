---
id: 9902
title: Locale formatting and labels in the report pages; single frame in admin users/orgs
agent: glm
tier: T1
depends_on: [902, 703]
verify: make verify
timeout_min: 60
---
## Goal
Lead review of 902/703 (2026-10-06, RU at 1440/390): amounts and labels on the new pages ignore the locale, and admin tables sit in a double frame. Fix exactly the items below; nothing else.

## Read first
- `apps/web/src/components/ui/Amount.tsx` (locale-aware money: `<Amount minor currency decimals locale />`), `apps/web/src/lib/ui/amount.ts`
- `apps/web/src/components/ui/Badge.tsx` (`<Badge status="Paid" />` translates the status itself — do not pass children)
- `apps/web/src/app/(cabinet)/registrar/kyc/page.tsx` — how investor type / residency are translated (`kyc.registrar.types.*`, `kyc.registrar.residencies.*`)

## Items
1. `src/app/(cabinet)/investor/reports/page.tsx`
   - Table money cells (gross, tax, net, principal) use `<Amount … locale={locale} />` instead of `majorMinor(...)` — RU shows `500,00`, `10 000,00`.
   - KPI values (`<Kpi value=… />`, lines ~142–146) use `<Amount>` too (no `${x.gross} ${x.currency}` strings); RU "10 000,00 tKZT"; long values must not be cut at 390 px (no `truncate` on the KPI value; let it wrap or use a smaller size).
   - Status column: `<Badge status={p.status} />` with no children, so "Paid" reads "Выплачено" in RU.
   - Kind column: keep the code badge (INTR/REDM) but add the translated kind next to it like the action pages (`landing.kinds`).
2. `src/app/(cabinet)/registrar/reports/page.tsx`: investor type and residency through translations (reuse `kyc.registrar.types.*` / `kyc.registrar.residencies.*`), status through `<Badge status=… />` (translated), KYC column always via `<Address>` (never the raw string).
3. `src/app/(cabinet)/admin/users/page.tsx` and `admin/organizations/page.tsx`: the `DataTable` already draws its own bordered card — remove the wrapping `<Card>` around the table (keep the filter card), so there is one frame on desktop and on phones.
4. The print view `src/app/(print)/print/[report]/page.tsx`: same `<Amount>` / translated status rule.

## Acceptance criteria
- RU at 1440 and 390 px: no EN number formats, no raw enum values, no truncated KPI; EN unchanged in meaning.
- `e2e/reports.spec.ts` (or the 902 spec) gains one RU assertion: `/10\s000,00/` (RU groups with a narrow no-break space U+202F, so match with \s) and `Выплачено` visible on /investor/reports; `e2e/locale-stability.spec.ts` and the full mock e2e stay green.
- `make verify` green; `reports/worklog/9902.md`.
