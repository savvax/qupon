---
id: 91530
title: login and sign-up in the v2 design language
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 90
---
## Goal
`/login` and `/signup` are the first screens a judge sees after the landing; bring them to the v2 design language.

## Read first
- docs/design/language.md (tokens, type scale, primitives — follow it strictly)
- apps/web/src/app/(public)/login, (public)/signup, apps/web/src/app/ui (primitives gallery), apps/web/e2e/login.spec.ts
- apps/web/messages/{en,ru,kk} (strict key parity is tested)

## Do
- Rebuild both pages with the v2 primitives: one-click demo roles (issuer, registrar, investor, paying agent) as the
  primary path with one line each on what that role can do; email sign-in secondary; wallet sign-in where it exists today.
- 390 px: no horizontal scroll, tap targets ≥ 44 px; keyboard: visible focus, Enter submits.
- Keep every existing behaviour and test id; update `login.spec.ts` only where markup moved.
- Screenshots (`bash ops/shots.sh` or Playwright) at 1440/390 in en/ru/kk → `reports/design/91530-login/`.

## Acceptance
typecheck, lint, unit tests, `login.spec`, `sweep.spec`, `locale-stability.spec` green in mock mode; `make verify`
green. Commit `feat(web): login and sign-up in the v2 design` (`task: 91530`).

## Finish
Write `reports/worklog/91530.md` (3–6 lines), commit with `task: 91530`, print `DONE:91530` or `BLOCKED:91530 <reason>`.
