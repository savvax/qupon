---
id: 91305
title: Site scope table row "Secondary settlement" and README tour mentions of trades
agent: claude
tier: T1
depends_on: [1304, 1305]
verify: make verify
timeout_min: 20
---
## Goal
After tasks 1304 and 1305: the landing page's implemented-vs-simulated table gains the "Secondary settlement" row (EN/RU, same wording as the docs), and the README product tour mentions the registrar Trades page and the investor's leg funding.

## Acceptance criteria
- `landing.simulated.rows.trades` in EN and RU, rendered by `ImplementedVsSimulated`; README tour rows updated; `make verify` green.
