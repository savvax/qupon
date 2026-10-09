---
id: 1421
title: Mock trade amounts carry their decimals
agent: claude
tier: T2
depends_on: [1417]
verify: make verify
timeout_min: 20
---
## Goal
Review of 1417: mock cash() formats USDC with 2 fraction digits; renderDecimals infers 2 from display and shows 6-decimal minor units 10^4 too large in mock mode. Return decimals and format display at the asset's decimals.
