---
id: 1533
title: investor — claim, payout route, calendar, yield, holder lookup, signing guard
agent: glm
tier: T1
depends_on: [1530, 1502, 1525]
verify: make verify
timeout_min: 180
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1533 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/design/language.md (from 1530)
- apps/web/src/app/globals.css

## Plan section
### Task 1533: investor — claim, payout route, calendar, yield, holder lookup, signing guard

**Agent:** glm · **Depends on:** 1530, 1502, 1525 · **Role:** frontend

- [ ] Claim button per unpaid funded entitlement (wallet-signed `pay_batch` for one holder via a new builder in `src/lib/portal.ts`; demo investor via the session proxy).
- [ ] Payout route card (wallet / bank: IBAN-like text hashed client-side with WebCrypto, only the hash leaves the browser; SIMULATED bank badge), signed by the wallet.
- [ ] Portfolio header: "Claimable now · Next coupon in N days · Received to date", plus a "Claim all" button.
- [ ] Payout calendar for the next 12 months of record/payment dates (from `/holders/{owner}`).
- [ ] Positions with clean, accrued and dirty value and YTM (`yield.ts`), plus default/cure badges.
- [ ] Public `/holder/[address]` page (no login) rendering `/holders/{owner}`.
- [ ] `walletSigner.ts`: before sending, compare the signed transaction's message bytes with the bytes we built; mismatch → abort with a clear error (unit test with a tampering mock wallet).

**Acceptance:** specs + unit tests green; Opus design score ≥ 8; `make verify` green.

## Finish
`make verify` green, commits carry `task: 1533`, `reports/worklog/1533.md` written. Print `DONE:1533` or `BLOCKED:1533 <reason>`.

## Review feedback (round 1, 2026-10-10 10:10) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Fail. The signing guard, valuation/YTM, the 12-month calendar, the claim builder and the public holder page are in place, and the 31 web unit tests pass. Two acceptance items are functionally broken: (1) the bank payout route can never be saved, because PayoutRouteCard branches on `route` instead of `mode`; (2) the demo investor's Claim posts `owner: undefined`, so the registrar returns 400, and watch mode still shows Claim buttons. 'Every payout row shows gross/tax/net' fails on mobile (columns hidden below lg/sm). Design score is 6/10: Claim all is clipped at 390 px; colliding mock entitlement PDAs put a Claim button on a Paid row and make the Claimable KPI (2.0349 USDC) match nothing on screen; the public holder KPI prints raw mixed-currency minor units; SIMULATED is missing on the holder page's bank route and KYC badges. Each fix is small and listed with file and line. Go tests were not run in this review (command denied by permissions), so the Go side relies on the orchestrator's green make verify.

### Blocking
- apps/web/src/app/(cabinet)/investor/_components/PayoutRouteCard.tsx:54 — The bank route can never be saved. `save()` branches on `route === "wallet"` when it should branch on `mode`. With a connected wallet, choosing Bank and pressing Save always throws `bankWalletOnly` ("connect a wallet"), so the acceptance item "wallet / bank: IBAN hashed client-side… signed by the wallet" is unmet for bank. Line 125 also puts the raw `current.route` ("bank"/"wallet") into the string, which leaves English in ru/kk.
  **Fix:** Change line 54 to `if (mode === "wallet")`. The hash computed on lines 50-53 already covers both routes, so `buildSetPayoutRouteIx(position.mint, signer, route, hash)` works for bank unchanged. Keep the `bankWalletOnly` throw only for non-wallet modes, or delete it, since the Save button only renders in wallet mode. On line 125 pass `route: t(current.route)` instead of `current.route`.
- apps/web/src/app/(cabinet)/investor/_lib/useClaims.ts:77 — The demo investor's Claim always fails against the real registrar. In demo mode there is no connected wallet: InvestorIdentity only picks demo when `publicKey` is null. So `owner: publicKey?.toBase58()` is undefined, and Go `demoClaim` answers 400 "owner must be a base58 pubkey". The mock handler ignores the body, which hides the bug. In watch mode the Claim and Claim-all buttons still render and fall into this demo path, although the hook's own doc says read-only viewing offers no button.
  **Fix:** Add an `owner: string` parameter: `useClaims(rows, reload, mode, owner)`, called from PortfolioView with `useInvestor().owner`. Send `{ action: target.actionPda, owner }`. In PortfolioHeader.tsx, make the `claimable` set empty when `mode === "watch"` (line 252), so neither the history Claim button nor Claim all renders. In apps/web/src/mocks/features/trades.ts, make the `/demo/investor/claim` mock reply 400 when the body has no `owner`, so mock mode catches this regression.
- apps/web/src/app/(cabinet)/investor/_components/PortfolioHeader.tsx:293 — "Every payout row shows gross, withheld tax and net" (task headline) is not met on mobile or tablet. The gross and tax columns are `hideBelow: "lg"`, so at 390 px (screenshot investor-ru-390) a payout row shows only net. On the public holder page, tax is `hideBelow: "sm"` (holder/[address]/page.tsx:153).
  **Fix:** Remove `hideBelow` from the `gross` and `tax` columns (lines 293 and 309) and set `essential: true` on both. If width is needed, hide `kind` and `vote` instead. In holder/[address]/page.tsx:153, replace `hideBelow: "sm"` with `essential: true`.
- apps/web/src/app/(cabinet)/investor/_components/PortfolioHeader.tsx:99 — At 390 px the petrol header's "Claim all" button is clipped off the right edge (investor-ru-390.png shows "Получить вс…"). The KYC badge and the button sit in a non-wrapping flex row.
  **Fix:** Change the wrapper on line 99 from `flex items-center gap-2` to `flex w-full flex-wrap items-center gap-2 sm:w-auto`. Give the Claim-all Button `className="w-full sm:w-auto"` so it drops below the KYC badge on mobile.
- apps/web/src/app/(public)/holder/[address]/page.tsx:207 — The public "Received" KPI is wrong money display. It sums net and principal across currencies (tiyn + USDC micro-units) into one bigint and prints it raw (`received.toString()`) under the label "Received (minor units)". The page's `<Amount>`s also get no `locale`, so ru/kk show en number formatting. The bank-route and KYC badges have no SIMULATED label (AGENTS rule 6: bank transfer and KYC vendor are simulated).
  **Fix:** Group the paid entitlements by `(e.net ?? e.gross).currency`, as `receivedToDate` in investorStats.ts does. Render one `<Amount minor currency locale>` per currency as the KPI value; Kpi accepts a ReactNode, or render the block inline. Rename `holder.kpi.received` to "Received to date" in en/ru/kk. Pass `locale={locale}` to every `<Amount>` on the page. Next to the `route.bank` badge add `<ProvenanceChip kind="simulated">`, and append "(SAS · SIMULATED)" to the KYC badge, as PortfolioHeader does.
- apps/web/src/mocks/api.ts:371 — Mock fixtures make the shipped screen contradictory. Entitlement PDAs are built with `ACTION_PDA_x.slice(0, 4)`, which is "Actn" for every action, so the PDAs collide across ACTION_PDA_1/2/4. The history then dedups away the funded BTRK entitlement and shows a Claim button on a Paid QPNb1 row ("paid Mar 1, 2026"). The "Claimable now" KPI reads 2.0349 USDC, matching no visible row. The BTRK USDC minors are also 1000× too small for 6-decimal USDC: 2394000 renders as 2.394 USDC, while the card's coupon estimate is 2,392.50 USDC.
  **Fix:** At lines 332, 348 and 371 build the PDA with `ACTION_PDA_x.slice(4, 12)` (unique per action). In the ACTION_PDA_4 fixture, scale every USDC minor ×1000: gross 3192000000/2394000000/2394000000, tax 359100000, perUnitGross 79800000, escrowBalance and totalGross 7980000000, totalTax 359100000, totalNet 7620900000. Re-shoot /investor: the Claim button must sit on the BTRKdemo-INTR-0002 row, and "Claimable now" must equal that row's net (2,034.90 USDC for owner 2).

### Acceptance criteria not met
- Claim button per unpaid funded entitlement: wallet-signed pay_batch via a builder in portal.ts; demo investor via the session proxy — buildClaimIx (portal.ts) now honours the bank/wallet route and creates the ATA idempotently. claimableEntitlements is tested. But the demo path posts owner=undefined (useClaims.ts:77), so Go returns 400. Watch mode still shows the buttons. In mock mode the button lands on a Paid row because of a PDA collision.
- Payout route card: wallet/bank, IBAN hashed with WebCrypto (only the hash leaves), SIMULATED bank badge, wallet-signed — sha256Hex/sha256Bytes are tested against known vectors, buildSetPayoutRouteIx exists and the SIMULATED chip renders. But save() branches on route instead of mode, so the bank route always throws bankWalletOnly, even with a wallet connected.
- Every payout row shows gross, withheld tax and net — Holds at desktop width. Investor history hides gross/tax below lg, and the holder page hides tax below sm. At 390 px only net shows.
- Opus design score ≥ 8 — Score 6. Problems: Claim all clipped at 390 px; a Claim button on a paid row; claimable KPI contradicts the table; gross/tax hidden on mobile; holder KPI shows raw minor units.
- Plan 15 global constraints (tokens only, SIMULATED labels, en/ru/kk, explorer links) — No stray hex in the changed investor/holder files; bg-default/cure-* are globals.css tokens. ru/kk keys are present. The tx toast and holder paidTxUrl carry explorer links. Missing SIMULATED labels on the holder page's bank route and KYC badges; the raw route string leaks English into ru/kk.

Design score: 6/10
