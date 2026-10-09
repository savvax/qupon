---
id: 91537
title: /learn: plan-15 concepts (hook record date, default & cure, bank route, anchoring, crank)
agent: glm
tier: T1
depends_on: [1532]
verify: make verify
timeout_min: 180
---
## Goal
`/learn` (task 1531) explains a coupon's life. Add the plan-15 mechanics in plain language so a non-engineer judge
understands why Qupon is ahead.

## Read first
- apps/web/src/app/(public)/learn, apps/web/src/lib/glossary.ts, apps/web/messages/{en,ru,kk}/kit.json (`kit.glossary`)
- docs/design/language.md; docs/02-architecture.md (plan-15 sections at the end)

## Do
- New sections on `/learn`: "The register never pauses" (transfer-hook record date), "Anyone can push the next step"
  (permissionless crank), "When the issuer is late" (default, one series day of grace, cure by funding, public defaults
  count), "Paid to your bank" (holder-chosen route, paying-agent confirmation — label SIMULATED), "The notice is
  anchored" (sha256 of seev.031 on-chain), "Buying between coupons" (accrued interest, negative in the ex-coupon window).
  Each: 2–3 sentences + a small diagram built from existing primitives (no images), and a link to a real devnet tx from
  `reports/demo-plan15.md`.
- Add the new terms to the glossary (en/ru/kk, definitions in messages, order in glossary.ts).
- Screenshots 1440/390 en/ru/kk → `reports/design/91537/`.

## Acceptance
typecheck, lint, unit tests (`messages.test`, `glossary.test`), `guidance.spec`, `locale-stability.spec` green;
`make verify` green. Commit `feat(web): /learn explains the plan-15 mechanics` (`task: 91537`).

## Finish
Write `reports/worklog/91537.md` (3–6 lines), commit with `task: 91537`, print `DONE:91537` or `BLOCKED:91537 <reason>`.
