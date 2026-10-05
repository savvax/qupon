---
id: 9309
title: Security hardening from the pre-deploy review (RPC key never in errors, limits, redirects, cache, login limiter)
agent: claude
tier: T1
depends_on: []
verify: make verify
timeout_min: 120
---
Findings of the independent review, verified by the lead: solana-go prints the full RPC URL (api-key) in errors that reached logs and public 502 bodies; no executor concurrency cap / body limits / server timeouts / demo sign-in limit; next= tab bypass; cache keyed by arbitrary query and flushed by anonymous /auth POSTs; login limiter counts successes and never evicts. Finish with DONE:9309.
