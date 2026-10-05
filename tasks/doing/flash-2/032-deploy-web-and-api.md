---
id: 032
title: Deploy web (Vercel) and API (Fly.io/Railway) pointed at devnet; public URLs in README
agent: flash
tier: T1
depends_on: [030, 031]
verify: make verify
timeout_min: 30
---
## Goal
Judges open a link, not a terminal.

## Read first
- apps/web
- services/registrar

## Steps
1. `services/registrar/Dockerfile` (multi-stage, includes Node + built `qupon` CLI for the executor), `fly.toml` or `railway.json`; env docs; health check.
2. `apps/web` Vercel config (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_RPC_URL`); `vercel.json` if needed.
3. Add deployment steps and URLs to README and `HUMAN_TODO.md` (human performs the actual `vercel`/`fly deploy` logins; scripts must be one command each).

## Acceptance criteria
- [ ] Both URLs respond; console loads demo series; documented in README.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/032.md`, then print exactly `DONE:032` or `BLOCKED:032 <reason>`.

## Note (lead, 023 merge)
- `POST /actions/{pda}/advance` signs with the operator keys. For the public deploy set `ADVANCE_TOKEN` on the API (secret store, not git) and have the console send `Authorization: Bearer` from a server-side route only — never a NEXT_PUBLIC_ variable.
