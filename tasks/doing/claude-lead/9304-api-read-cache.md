---
id: 9304
title: Short read cache for chain read models in the registrar API
agent: claude
tier: T1
depends_on: []
verify: make verify
timeout_min: 30
---
Found in the live check: GET /series takes ~3 s and investors ~1.3 s on devnet; every page lists them. 10 s cache for GET /series* and /actions/* (not reconcile), cleared by any successful write. Finish with DONE:9304.
