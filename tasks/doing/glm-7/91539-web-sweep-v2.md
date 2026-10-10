---
id: 91539
title: design sweep: every route incl. plan-15 pages × en/ru/kk × 1440/390
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 180
---
## Goal
Task 1537 (Opus design pre-flight) reviews screenshots of every screen. The sweep only covers en/ru and misses the
plan-15 pages. Extend it so one run produces the full set.

## Read first
- apps/web/e2e/sweep.spec.ts (route groups, `check()`), apps/web/playwright config, the mock-mode fixtures for the new
  pages: `/sandbox/fx-<state>` (apps/web/src/mocks/features/sandbox.ts), `/proof/<mint>` (e2e/fixtures/proof-rpc.json
  via e2e/proof.spec.ts), the showcase mints in apps/web/src/mocks/api.ts, `/holder/<address>`, `/bonds/<mint>`,
  `/registrar/actions/<pda>` (existing fixture PDAs in the mocks).

## Do
- Locales en, ru AND kk (cookie NEXT_LOCALE), widths 1440 and 390, as today.
- Add routes: `/learn`, `/proof` and `/proof/<showcase mint>` (mocked RPC like proof.spec), `/sandbox/new`,
  `/sandbox/fx-snapshot`, `/sandbox/fx-defaulted`, `/sandbox/fx-bank` (use the state names the mock defines),
  `/bonds/<showcase mint>`, `/holder/<demo investor address>`, `/registrar/actions/<fixture action PDA>`, `/ui`.
- Keep the existing assertions (no horizontal scroll, no hydration errors) for every new route.
- Write the screenshots to `reports/design/preflight/before/<route-slug>-<locale>-<width>.jpg` when
  `SWEEP_OUT=reports/design/preflight/before` is set (default path unchanged), and an index
  `reports/design/preflight/before/index.md` listing every shot with its route.
- Run it once in mock mode and commit the shots + index.

## Acceptance
`sweep.spec.ts` green in mock mode for all three locales; shots and index committed; `make verify` green.
Commit `test(web): design sweep covers plan-15 pages in en/ru/kk` (`task: 91539`).

## Finish
Write `reports/worklog/91539.md` (3–6 lines), commit with `task: 91539`, print `DONE:91539` or `BLOCKED:91539 <reason>`.
