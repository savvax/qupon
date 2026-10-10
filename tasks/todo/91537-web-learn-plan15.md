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

## Review feedback (round 1, 2026-10-10 13:15) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Not mergeable yet: two blocking items. First, a typo in the finalize tx signature (page.tsx:32, 'ZW9Jf' should be 'ZW4Jf') makes one of the crank card's explorer links point to a transaction that doesn't exist. Second, the bank card nests a full MoneyFlow (its own title, subtitle and step-through) in a half-width card, which truncates the agent row in ru at 1440 (design score 7). Everything else meets the task: six cards with accurate plan-15 copy, 9/10 real devnet signatures, correct accrued split, SIMULATED labels, 3 glossary terms in all locales, screenshots committed, unit tests green.

### Blocking
- apps/web/src/app/(public)/learn/page.tsx:32 — The `TX.finalize` signature has a one-character typo: the page has `...MGiQsnjiZW9Jf2sW...` but reports/demo-plan15.md:44 has `...MGiQsnjiZW4Jf2sW...`. The "Finalize snapshot" step in the "Anyone can push the next step" card therefore links to a transaction that doesn't exist on explorer. That fails the requirement that every card link a real devnet tx and the rule that every tx gets a working explorer link. The other 9 signatures match the report exactly.
  **Fix:** Set TX.finalize to the exact string from reports/demo-plan15.md:44: "2cnBqgTiduZsBF3XxCVzbSGCjHhCqSJwGNpmPkerMJhoMGiQsnjiZW4Jf2sWQUaCbKxB8fWrznpXCsvqMeWNL9hn". Better still, copy-paste all 10 signatures from the report instead of retyping them.
- apps/web/src/app/(public)/learn/page.tsx:302 — Design score 7, below the threshold of 8. The "Paid to your bank" card puts a full MoneyFlow inside a half-width card. That nested component brings its own "Where the money goes" heading (a copy of the section right above), the "Example numbers from the brief" subtitle and a "Step through" button, so it is a card inside a card and not the small diagram the task asks for. In the ru 1440 screenshot it doesn't fit: the agent row's label is cut to "Платёжный а…" / "Держатель: Держате…" and its tx link is cut next to the Simulated chip. The other five cards use compact diagrams.
  **Fix:** Replace the MoneyFlow in the bank card with an ActionFlow, like the other cards: steps = [{id:"route", label:t("plan15.bank.l1") /* Holder chooses the bank route */, state:"done", actor:"holder"}, {id:"agent", label:t("plan15.bank.l2") /* Paid to the paying agent */, state:"done", actor:"anyone", tx:TX.pay}, {id:"confirm", label:t("plan15.bank.l3") /* Agent confirms the transfer */, state:"done", actor:"payingAgent", tx:TX.confirmBank, detail:<ProvenanceChip kind="simulated" />}, {id:"done", label:t("plan15.bank.l4") /* Complete */, state:"done", actor:"anyone", tx:TX.complete}]. Add plan15.bank.l1–l4 to en/ru/kk learn.json. Keep "the bank transfer itself is simulated" in the body text. Then re-shoot /learn at 1440 and 390 and check that no label in the card is truncated.

### Acceptance criteria not met
- Six new /learn sections (hook record date, crank, default & cure, bank route, anchored notice, accrued), each with 2–3 sentences and a small diagram built from existing primitives — All six cards are present with 2–3 sentence bodies. Five use compact primitives (ActionFlow, or a ProvenanceChip/Amount row). The bank card nests a full MoneyFlow with its own title and step-through, and its labels are truncated in ru at 1440 (see blocking).
- Each section links a real devnet tx from reports/demo-plan15.md — 9 of 10 signatures match the report exactly. TX.finalize (page.tsx:32) has 'ZW9Jf' where the report has 'ZW4Jf', so the link is broken.

Design score: 7/10

## Review feedback (round 2, 2026-10-10 13:43) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Not mergeable yet, for one reason: the screenshots committed to reports/design/91537/ show the page before the change. Both round-1 problems are fixed: all 10 devnet signatures now match reports/demo-plan15.md exactly, and the bank card is a compact ActionFlow with a SIMULATED chip. The rest is fine. All six plan-15 cards have accurate copy and real explorer links, the accrued split is correct, the three glossary terms are in all three locales and the unit tests pass. Fresh en/ru shots at 1440 look good: the new cards match the six-step cards and nothing is truncated (design score 8). But all six committed PNGs were shot against old code, with no 'Six mechanics' section and no new glossary terms. That means the screenshot deliverable is unmet and the worklog's 're-shot' claim is wrong. Re-shoot from this worktree with SHOT_LOCALES="en ru kk" and commit.

### Blocking
- reports/design/91537/learn-en-1440.png — The committed screenshots don't show this task's change. reports/design/91537/learn-en-1440.png (1440×3073) and learn-kk-1440.png (1440×3192) go straight from 'Where the money goes' to the Glossary. They have no 'Six mechanics under the hood' section and none of the 3 new glossary terms (Payout route / Grace day / Anchored notice). They were shot against a server running the old code, probably a stale server left over from the worktree reaper incident. A fresh shot from this worktree is 1440×4447 and includes the section. The task's 'Screenshots 1440/390 en/ru/kk → reports/design/91537/' deliverable is therefore unmet, and the worklog/commit claim 'Screenshots re-shot' is false.
  **Fix:** Stop any running next/playwright web server first. Then, from this worktree, with a free E2E_PORT, run: SHOT_LOCALES="en ru kk" bash ops/shots.sh reports/design/91537 /learn. Open each of the 6 PNGs and confirm it contains the 'Six mechanics under the hood' heading (ru 'Шесть механик под капотом', kk 'Қаптастың астындағы алты механика') and the Payout route / Grace day / Anchored notice glossary entries. Commit the PNGs, and fix the worklog line that still says the bank card reuses MoneyFlow.

### Acceptance criteria not met
- Screenshots 1440/390 en/ru/kk in reports/design/91537/ — The committed PNGs show the page before the change: no plan-15 section and no new glossary terms.

Design score: 8/10
