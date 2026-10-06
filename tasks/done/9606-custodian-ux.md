---
id: 9606
title: Custodian page — locale dates and amounts, phone card keeps the tx, single frame
agent: claude
tier: T1
depends_on: [606]
verify: make verify
timeout_min: 30
---
## Goal
Lead review of 606 (RU, 1440/390): ledger date in ISO, amount in EN format on the RU page, tx/treasury columns dropped on phones, table inside a card (double frame). Fix those four.
## Acceptance criteria
- RU shows 06.10.2026, 14:06 and 12 000,00 dKZT; phone card shows the transaction; one frame; e2e admin-custodian stays green; make verify; worklog.
