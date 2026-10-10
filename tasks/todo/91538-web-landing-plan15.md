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

## Review feedback (round 1, 2026-10-10 12:46) — fix every blocking item first; your previous work is already committed on this branch

### Summary
91538 is not ready to merge, for one reason: the "Default and cure" card's explorer link points to a transaction that doesn't exist. The signature has a lowercase `t` (`...M8DxZt8Kde...`) where reports/demo-plan15.md:45 and the proof RPC fixture have an uppercase `T`, so Solana Explorer will show 'not found'. The fix is a one-character change in apps/web/src/app/(public)/_landing/sections.tsx:337. Everything else checks out: the "Proven on devnet" facts match verified-build.md and the demo reports (28 and 60 txs). The simulated-vs-real table reuses the shared component, the bank route is labelled SIMULATED, and the hero is untouched. ru and kk are complete and use only design tokens. Unit tests pass (235). Of the e2e specs (landing, locale-stability, proof, sweep), 24 pass; the one failure is the landing.spec RU-button locator the task already allows. Design score 8. The /learn links won't land on their sections until 91537 adds those section ids.

### Blocking
- apps/web/src/app/(public)/_landing/sections.tsx:337 — The explorer link on the "Default and cure" card has a typo in its tx signature: `...eNeM8DxZt8Kde...` has a lowercase `t`. The signature in reports/demo-plan15.md:45 and in e2e/fixtures/proof-rpc.json is `...eNeM8DxZT8Kde...` with an uppercase `T`. Base58 allows both letters, so the link looks valid but Solana Explorer shows 'not found'. The task requires each card to link one real devnet tx, so this evidence link is broken.
  **Fix:** Replace the `tx` value of the `default` entry in BEYOND with `2BvYuaWjSbNxVv3Lb618fTsxeWcNeM8DxZT8Kde33bdXJDLLUhxRs8uWMMAuExaVnf4ERePP75bp2fRGjfgFiBGF`, copied from reports/demo-plan15.md line 45. Optionally add a vitest that asserts every BEYOND tx string appears in reports/demo-plan15.md (export BEYOND or move it into a small data module) so a hand-copied signature can't drift again.

### Acceptance criteria not met
- "Beyond a coupon" cards (default & cure, bank route, permissionless crank, accrued interest on DvP, anchored notice), each linking to its /learn section and one devnet tx — All five cards are present and the bank card has a SIMULATED chip. Four tx signatures match demo-plan15.md exactly; the default/cure one has a typo (see blocking). The /learn anchors (#default, #bank-route, #crank, #accrued, #anchored-notice) don't exist on /learn yet; they depend on 91537, which is not a dependency and is still in todo.

Design score: 8/10
