---
id: 91304
title: Ship the demo investor keypairs 1–3 to the VPS registrar (demo trade funding)
agent: claude
tier: T2
depends_on: [1303]
verify: make verify
timeout_min: 20
---
## Goal
The demo trade-funding route (task 1303) signs only for parties whose keypair the server holds; the VPS received only the demo investor's key (investor3). Ship investors 1–3 the same way (env JSON → file in the container) so a judge can fund both legs of a demo trade from the registrar cabinet.

## Acceptance criteria
- `ops/deploy-vps.sh` sends `QUPON_INVESTOR{1,2,3}_KEYPAIR_JSON`; `services/registrar/entrypoint.sh` materialises them as `QUPON_INVESTOR{1,2,3}_KEYPAIR`; no key content in git, argv or logs.
