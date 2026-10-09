---
id: 91538
title: landing middle sections in the v2 design (proof, what is simulated, plan-15 highlights)
agent: glm
tier: T1
depends_on: [1532, 1536]
verify: make verify
timeout_min: 180
---
## Goal
1530 left the middle of the landing in the old style. Finish it in the v2 design language and make the evidence
impossible to miss.

## Read first
- docs/design/language.md; apps/web/src/app/(public)/_landing and page.tsx; reports/verified-build.md;
  reports/demo-plan15.md; docs/01-product.md ("Implemented vs simulated" table)

## Do
- Sections between hero and footer: "Proven on devnet" (verified-build hash with the verify command, link to
  `/proof/<mint>` from 1536, counts of devnet transactions from the demo reports), "What is real, what is simulated"
  (the shared table component from 1536 — reuse, do not copy), "Beyond a coupon" (cards for default & cure, bank route,
  permissionless crank, accrued interest on DvP trades, anchored notices — each linking to its `/learn` section and one
  devnet tx).
- Keep the hero and the sandbox CTA from 1532 untouched.
- Screenshots 1440/390 en/ru/kk → `reports/design/91538/`.

## Acceptance
typecheck, lint, unit tests, `landing.spec` (other than the known stale locator if 91531 has not merged), `sweep.spec`,
`locale-stability.spec` green; `make verify` green. Commit `feat(web): landing evidence sections` (`task: 91538`).

## Finish
Write `reports/worklog/91538.md` (3–6 lines), commit with `task: 91538`, print `DONE:91538` or `BLOCKED:91538 <reason>`.
