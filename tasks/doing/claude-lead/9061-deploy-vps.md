---
id: 9061
title: Deploy console + registrar API to the team VPS (Docker Compose + Caddy HTTPS) instead of Vercel/Fly
agent: claude
tier: T1
depends_on: [9032, 9060]
verify: make verify
timeout_min: 90
---
## Goal
Human decision (2026-10-05): deploy on `root@85.192.29.7` instead of Vercel/Fly. Judges open a link.

## Acceptance criteria
- [ ] `ops/deploy-vps.sh` (one command) rsyncs the repo, writes server-side secrets (never in git), builds and starts registrar + web + Caddy; both HTTPS URLs respond; console loads devnet series; portal reads work cross-origin; README/SUBMISSION/HUMAN_TODO updated.
