---
id: 91544
title: statements and reports: default/cure and bank-routed payouts
agent: glm
tier: T1
depends_on: [1521]
verify: make verify
timeout_min: 180
---
## Goal
Investor statements and issuer reports must tell the plan-15 story: a payout that went through the bank route, the
paying agent's confirmation, and a default followed by its cure.

## Read first
- services/registrar/internal/api/reports.go (+ tests), apps/web/src/app/(cabinet)/investor/statements and
  investor/reports, apps/web/src/app/(cabinet)/issuer (reports), services/registrar/internal/ingest/events.go
  (`PaidToAgent`, `BankPayoutConfirmed`, `ActionDefaulted`, `DefaultCured` layouts)

## Do
- Investor statement rows: a bank-routed payout appears once, as "paid via bank (paying agent)", with gross, withheld
  tax, net, the agent payout tx and — once confirmed — the confirmation tx and reference hash; unconfirmed rows say
  "awaiting bank confirmation". CSV export gains `route` and `bank_confirmation_tx` columns.
- Issuer report per action: required vs funded, `defaulted_at`, `cured_at`, late seconds, and the count of bank-routed
  payouts confirmed / pending.
- Go tests with stored activity rows; web unit tests for the row mapping; en/ru/kk strings (label bank transfers
  SIMULATED).

## Acceptance
`go test ./services/registrar/...`, web typecheck/lint/test green; `make verify` green.
Commit `feat(reports): bank-routed payouts and default/cure in statements` (`task: 91544`).

## Finish
Write `reports/worklog/91544.md` (3–6 lines), commit with `task: 91544`, print `DONE:91544` or `BLOCKED:91544 <reason>`.

## Review feedback (round 1, 2026-10-10 12:40) — fix every blocking item first; your previous work is already committed on this branch

### Summary
The Go side is solid. store.BankPayouts and api.bankRoute mark rows as bank-routed, and ActionSummary carries required vs funded, the default/cure stamps, late seconds and bank counts. The field names match the ingest event layouts, and the Go and web tests assert real values. The web row mapping and en/ru/kk SIMULATED strings are present. Merge is blocked for two reasons. First, the mock-mode reports fixtures were not updated: the TS CSV mirror lacks the route and bank_confirmation_tx columns, and there are no bank rows and no issuer `action` summary, so none of the new UI renders and the screens could not be design-reviewed. Second, the long bank labels sit inside a nowrap Badge and will likely overflow at 390 px. Both fixes are small and confined to apps/web.

### Blocking
- apps/web/src/mocks/features/reports.ts:160 — The mock-mode reports contract no longer matches Go. PAYOUT_HEADER/payoutRows (documented as 'Same shape as the Go CSV') still have 15 columns, while Go now emits `route` after `status` and `bank_confirmation_tx` after `paid_at`. The /me/reports/statement and /issuer/reports/payouts mocks also return no bank-routed row and no `action` summary. As a result none of the new plan-15 UI ever renders in mock mode: no bank label, no confirmation tx, no ref hash, no issuer required/funded/default/cure block. The screenshot pass only showed a Route column of '—'.
  **Fix:** In reports.ts: (1) add "route" after "status" and "bank_confirmation_tx" after "paid_at" in PAYOUT_HEADER, and in payoutRows emit `p.route ?? "onchain"` and `p.bankConfirmationTx ?? ""` at the same positions. (2) Make coupon(2) (65 units, 15% tax holder) `route: "bank"` with a real-looking `bankPayoutTx`, `bankConfirmationTx` and `bankRefHash` (status Paid). Add one memberPayouts row with `route: "bank", status: "PaidToAgent"` and only `bankPayoutTx`, so both confirmed and awaiting states are visible. (3) For the non-REDM action, add `action: { required:{minor,display,currency}, funded:{…}, defaultedAt:'2026-03-01T…+05:00', curedAt:'…', lateSeconds:1800, bankConfirmed:1, bankPending:0 }` to the /issuer/reports/payouts JSON reply, using the brief's numbers. Then re-run shots for /investor/reports, /investor/statements and /print/payouts?pda=<ACTION_PDA_1>.
- apps/web/src/app/(cabinet)/investor/reports/page.tsx:158 — The bank label goes inside <Badge>, which is `whitespace-nowrap shrink-0`. The strings are about 50 characters ('Выплачено через банк (платёжный агент) — SIMULATED', 'Банк арқылы төленді (төлем агенті) — SIMULATED'). At text-xs bold that is roughly 340 px, which exceeds the value cell of the 390 px card layout. That causes horizontal overflow or clipped text on phones, and it also widens the already right-clipped 1440 px statement table.
  **Fix:** Keep the pill short: add reports.bank.paidViaBankShort ('Paid via bank' / 'Выплачено через банк' / 'Банк арқылы төленді') and awaitingBankShort ('Awaiting bank' / 'Ожидает банка' / 'Банкті күтуде') and pass those as Badge children. Render the '(paying agent) — SIMULATED' qualifier below it as `<span className="text-xs text-n500">`, or as the existing ProvenanceChip kind=simulated, inside the existing flex-col wrapper. Verify there is no horizontal scroll at 390 px in ru and kk with the mock row from item 1.

### Acceptance criteria not met
- CSV export gains route and bank_confirmation_tx columns — Met in Go (PayoutTable, TestPayoutTableBankRoute, CSV asserted in the API test). The TS mock CSV, documented as the same shape as Go, still lacks both columns.
- Web screens pass design review at 1440/390 in shipped locales — Shots of /investor/statements and /investor/reports in en/ru at 1440/390 show only a Route column of '—'. The bank states and issuer summary cannot be rendered in mock mode, and the long nowrap badge labels will likely overflow at 390 px.

Design score: 6/10

## Review feedback (round 2, 2026-10-10 13:49) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Both round-1 blockers are fixed. The TS mock CSV now mirrors Go's route and bank_confirmation_tx columns. The mocks include a confirmed bank row, an awaiting-bank row and the issuer action summary with the brief's numbers. The bank pill is short, with the SIMULATED qualifier beneath it, and does not overflow at 390 px. The Go side is unchanged from round 1 and its reports/api/store tests pass. The web unit tests assert the full route mapping; I couldn't run them here because the permission was denied, but the orchestrator's make verify passed. Merge is blocked by one small, web-only i18n problem in the new issuer summary on /print/payouts. Lateness renders as hardcoded English '30 min' in ru/kk, and Required/Funded show the raw '5000.00 tKZT' display string instead of the localized <Amount> used everywhere else on the page ('5 000,00 ₸'). Both fixes are confined to reports.ts, the print page and the three message files.

### Blocking
- apps/web/src/lib/reports.ts:58 — The issuer summary leaves English in the ru/kk locales. formatLateSeconds hardcodes "h"/"min", so the ru print shot of /print/payouts reads "Опоздание: 30 min" (kk does the same). The design checklist says no English may remain in ru/kk.
  **Fix:** Add messages reports.issuer.summary.lateMin and lateHM to en/ru/kk: en "{m} min" / "{h} h {m} min", ru "{m} мин" / "{h} ч {m} мин", kk "{m} мин" / "{h} сағ {m} мин". Change formatLateSeconds to return {h, m} (null when s <= 0). In print/[report]/page.tsx, render the result with t(h > 0 ? "issuer.summary.lateHM" : "issuer.summary.lateMin", {h, m}). Update the reports.test.ts expectations: 1800 → {h:0,m:30}, 5400 → {h:1,m:30}, 0 → null.
- apps/web/src/app/(print)/print/[report]/page.tsx:148 — Required and Funded show the server's raw display string. The ru shot shows "Требуется: 5000.00 tKZT" with a decimal point, no thousands separator and a tKZT suffix. Every other amount on the same page goes through <Amount> and shows "5 000,00 ₸", so the new block is inconsistent and not localized.
  **Fix:** Change summaryRows to [string, React.ReactNode][]. Render the two values as <Amount minor={summary.required.minor} currency={summary.required.currency} locale={locale} /> and the same with summary.funded, which is the pattern in registrar/actions/[pda]/page.tsx:141. Then re-shoot /print/payouts?pda=ActnINTR0001Dem0PDA111111111111111111111111111 in ru at 1440 and 390 and check that it shows "5 000,00 ₸".

### Acceptance criteria not met
- en/ru/kk strings, bank transfers labelled SIMULATED — The bank.* and issuer.summary.* keys exist in all three locales with SIMULATED. However, the lateness unit ('30 min') is hardcoded English and the amounts in the summary block are not localized.
- Web screens pass design review (design_score >= 8) — Score 7. The layout and hierarchy are good. The summary block on /print/payouts shows English 'min' and unlocalized '5000.00 tKZT' in ru.

Design score: 7/10
