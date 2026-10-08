---
id: 1417
title: Web: currency decimals from one source; USDC report totals; partial trade funding
agent: glm
tier: T0
depends_on: []
verify: make verify
timeout_min: 60
---
## Goal
1. Report totals (`src/app/(cabinet)/investor/reports/page.tsx` ~L165, `src/app/(print)/print/[report]/page.tsx` ~L306-329) call `majorToMinor(v, 2)` for every currency; Go sends major strings at the currency's own decimals ("12.500000" USDC) → USDC totals render 10,000× too small. Use the currency's decimals.
2. Two disagreeing decimal tables: `src/lib/ui/amount.ts` (`CURRENCY_DECIMALS`, no tUSDC) and `src/lib/format.ts` (~L76). Keep ONE table (in amount.ts), include every currency the registry/mocks use (tKZT, KZT, KZTE, KZTE-dev, dKZT, USDC, tUSDC; check `src/lib/cashAssets.ts` and the asset registry API for more) and make `<Amount>` fall back to decimals carried by the API (`display`/`decimals` fields when present) before the table.
3. `src/lib/trades.ts` (~L220): wallet funding sends the full leg amount even if partly funded → send `required - funded` floored at 0 (skip when 0).

## Acceptance criteria
- Vitest: totals for {currency:"USDC", gross:"12.500000"} render 12.50; `<Amount currency="tUSDC" minor="1000000">` → 1.00; only one CURRENCY_DECIMALS export remains.
- Vitest: `buildFundTradeIx` with half the cash funded transfers the other half.
- `make verify` green; `reports/worklog/1417.md`.
