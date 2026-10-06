---
id: 91109
title: One onboarding block on /investor (808 checklist + 802 banner)
agent: claude
tier: T1
depends_on: [802, 808]
verify: make verify
timeout_min: 45
---
## Goal
802 (banner) and 808 (checklist) both render on /investor for a self-registered investor on devnet. Keep one block: the checklist on devnet (current step highlighted with its action, KYC status from /me/kyc, progress bar, compact when done), the banner only where there is no checklist (mainnet / onboarding API down).
## Acceptance criteria
- Exactly one onboarding block on /investor in every state; e2e covers it; EN/RU; make verify green; worklog.
