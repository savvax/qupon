---
id: 9110
title: UX audit round 3 — every v2 page, EN/RU × 1440/390, fixes
agent: claude
tier: T1
depends_on: [1201, 703, 807, 902]
verify: make verify
timeout_min: 120
---
## Goal
Extend e2e/ux-audit.spec.ts to every page added by plans 7–12, run it, review the screenshots and fix what a careful designer would flag (overflow, truncation, raw keys/enums, EN on RU pages, inconsistent controls, missing motion). Items owned by 9902 are left to it.
## Acceptance criteria
- Audit: 0 hScroll, 0 raw keys, 0 English-on-RU, 1 h1 per page; fixes listed in reports/worklog/9110.md; locale-stability + full mock e2e green; make verify green.
