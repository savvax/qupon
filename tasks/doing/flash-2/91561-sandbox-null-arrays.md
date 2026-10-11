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

## Review feedback (round 1, 2026-10-11 09:46) — fix every blocking item first; your previous work is already committed on this branch

### Summary
The Go root-cause fix and its test are correct and pass, and the web null guards cover every read. The Dockerfile fix is broken: the new mkdir/chown RUN sits after the existing `USER node`, so it runs as non-root, the image build fails, and the cache dir is never made writable. Move the RUN above the single `USER node` and it can merge.

### Blocking
- apps/web/Dockerfile:25 — Acceptance item 3 is not met, and the image will not build. The diff inserts the new `RUN mkdir -p ./apps/web/.next/cache && chown -R node:node ./apps/web/.next` after the existing `USER node` on line 25, so the RUN executes as `node`. The files from the earlier COPYs are root-owned, so the mkdir inside `/app/apps/web/.next` fails with EACCES, and a non-root `chown` fails anyway. The build fails at that step, and nothing makes the cache dir writable. The worker also added a second `USER node` (line 28), which shows they missed the existing one.
  **Fix:** Delete the original `USER node` on line 25 so the order is: COPY standalone, COPY static, `RUN mkdir -p ./apps/web/.next/cache && chown -R node:node ./apps/web/.next` (runs as root), then a single `USER node`, then EXPOSE/CMD. Another option is `COPY --chown=node:node` on both COPY lines, plus a `RUN mkdir` + chown before `USER node`. Check with `docker build -f apps/web/Dockerfile .` locally (do not deploy).

### Acceptance criteria not met
- Dockerfile: create .next/cache and chown node:node before USER node — The RUN comes after the existing `USER node` (line 25), so it runs as the non-root user and fails. See blocking item.

Design score: 8/10
