---
id: 91561
title: "URGENT: fresh judge sandbox page crashes (entitlements: null) + web .next/cache EACCES"
agent: flash
tier: T1
depends_on: []
verify: make verify
timeout_min: 60
---
## Goal
On production, right after the landing CTA creates a sandbox, `/sandbox/<id>` renders "Something broke":
`TypeError: Cannot read properties of null (reading 'reduce')` in `apps/web/src/app/(public)/sandbox/[id]/panels.tsx:459`
(`s.entitlements.reduce`). `GET /demo/sandbox/<id>` returns `"entitlements": null` until the series has a corporate
action (services/registrar/internal/api/sandbox.go ~250: `d.Entitlements` stays a nil slice). The web contract
(`apps/web/src/lib/sandbox.ts`) types it as an array. A few minutes later the page works — the judge's first view breaks.

## Do
1. Go (root cause): every slice field of the sandbox DTO (`internal/api/sandbox.go` — entitlements, holders, schedule,
   steps, anything `[]T` with a json tag) marshals as `[]`, never `null` (initialise to empty slices). Table test: a
   sandbox with no actions → the JSON has `"entitlements":[]` and no `null` array anywhere in the slice fields.
2. Web (defence in depth, one line each): wherever panels.tsx reads `s.entitlements` / `s.holders`, use `?? []` once at
   the top of the component (not scattered).
3. `apps/web/Dockerfile`: the runtime user `node` cannot create `/app/apps/web/.next/cache` (prod log:
   `Failed to update prerender cache … EACCES: permission denied, mkdir '/app/apps/web/.next/cache'`). Create the dir
   and `chown node:node` it before `USER node` (or `COPY --chown=node:node`).

## Acceptance
Go test above green; web unit/typecheck green; `make verify` green. Commit
`fix(sandbox): empty arrays, never null; web cache dir writable` (`task: 91561`). Do NOT deploy.

## Finish
Write `reports/worklog/91561.md` (3–6 lines), commit with `task: 91561`, print `DONE:91561` or `BLOCKED:91561 <reason>`.
