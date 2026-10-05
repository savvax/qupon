---
id: 9308
title: Demo sign-in works before hydration (plain form post, redirect)
agent: claude
tier: T1
depends_on: []
verify: make verify
timeout_min: 20
---
On slow phones the first tap on a demo role did nothing until JS loaded (seen in the live e2e). The demo buttons submit a real form to /api/session/demo, which answers a form post with a 303 + cookie; hydrated clicks still use fetch. Finish with DONE:9308.
