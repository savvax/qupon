---
id: 9112
title: Wizard KASE import button aligned with its field; demo CTAs always offer the role choice
agent: claude
tier: T1
depends_on: [1002]
verify: make verify
timeout_min: 45
---
## Goal
User report 2026-10-06: (1) on /issuer/series/new the Import button sits at the label line, not beside the input; (2) the landing Open the demo always lands in the demo issuer cabinet — /login redirects a signed-in visitor home, so the role choice never shows.
## Acceptance criteria
- Button and input share one row (same top and height) at 1440 and 390, hint below; e2e asserts the alignment.
- Demo CTAs go to /login?choose=1; signed in, it shows the demo roles plus a continue-as bar; picking a role switches the session; e2e covers it. make verify; worklog.
