---
id: 1109
title: Landing shows platform v2 (accounts, KYC, KASE, digital tenge, admin, mainnet-ready)
agent: claude
tier: T1
depends_on: [1108, 802, 805]
verify: make verify
timeout_min: 60
---
## Goal
The landing page still describes only the engine. Add a "Platform" section (six feature cards with icons, scroll reveal and hover lift), an investor sign-up CTA, and bring the implemented-vs-simulated rows in line with docs/01-product.md. EN + RU, locale-stable, reduced motion respected.
## Acceptance criteria
- Section visible at 1440 and 390 px without horizontal scroll; EN/RU boxes equal (locale-stability); e2e asserts the section and the sign-up link.
- make verify green; reports/worklog/1109.md.
