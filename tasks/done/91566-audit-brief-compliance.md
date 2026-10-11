---
id: 91566
title: brief compliance matrix with evidence
agent: glm
tier: T1
depends_on: [1540]
verify: make verify
timeout_min: 150
---
## Goal
Pre-submission readiness audit (2026-10-12, code freeze 12:00 Almaty, submission 20:00): brief compliance matrix with evidence. Output: `reports/audit/brief-compliance.md`.

## Rules (audit task)
- AUDIT ONLY: do not change product code, docs or config. Your only output is `reports/audit/brief-compliance.md` (+ screenshots under
  `reports/audit/shots/audit-brief-compliance/` if you take any, JPEG, ≤ 300 KB each).
- Finding format, ranked most severe first: `### A<task-id>-<k> [P0|P1|P2] <title>` then **Where** (URL / `file:line`),
  **Evidence** (command + short output excerpt, or screenshot path), **Fix** (file + one sentence). P0 = blocks the
  submission or would clearly cost a judging criterion; P1 = a judge would notice; P2 = polish. End with a 5-line summary.
- Production is live and judged: GET requests and browsing only — no POST/PUT/DELETE, no admin actions, at most ONE
  sandbox created (it is rate-limited). Never print or commit secrets (`.env`, keypair JSON, keyed RPC URL, ADMIN_TOKEN).
  Devnet only.
- The GitHub repo `savvax/qupon` is private right now (owner's decision, being handled): list links that point to it
  under one finding, do not chase them further.
- Prod: site https://qupon.85-192-29-7.sslip.io, API https://api.85-192-29-7.sslip.io. Brief + judging criteria:
  `docs/00-brief.md` (read it first).

## Do
Map EVERY requirement of `docs/00-brief.md` to evidence: the 4-step challenge (identify holders → entitlements → execute →
record on-chain), the 3 required scenarios (coupon, redemption incl. burn/retire, one additional action — we have meeting
voting BMET→CHAN, early call MCAL, DvP secondary trade), the 8 minimum prototype requirements, the worked example (10 bonds ×
$1,000 × 10% ÷ 2 = 500; maturity 10,000 + final coupon), and the 5 KASE submission requirements.
For each row: implementation (`file:line` in programs/qupon_bonds, crates/entitlement, services/registrar), test that proves
it (name + `cargo test`/`go test` command you ran and its result), a devnet transaction from `reports/devnet-proof*.json`
(explorer link) and where a judge sees it live (URL on prod). Run `node --import tsx clients/ts/src/cli.ts proof:verify
reports/devnet-proof.json` (from clients/ts) and the entitlement fixture tests. Mark ✓ / partial / ✗; every partial/✗ is a
finding. Also check "clearly distinguish implemented from simulated": every simulated thing (KYC, bank/fiat rail, ISO
delivery, …) labelled SIMULATED in UI + docs — list any place it is not.

## Finish
`make verify` green (you only add reports). Commit `docs(audit): brief compliance matrix with evidence` with `task: 91566`, write
`reports/worklog/91566.md` (3 lines), print `DONE:91566` or `BLOCKED:91566 <reason>`.
