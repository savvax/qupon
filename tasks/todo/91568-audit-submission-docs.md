---
id: 91568
title: submission package and docs accuracy
agent: glm
tier: T1
depends_on: [1540]
verify: make verify
timeout_min: 150
---
## Goal
Pre-submission readiness audit (2026-10-12, code freeze 12:00 Almaty, submission 20:00): submission package and docs accuracy. Output: `reports/audit/submission-docs.md`.

## Rules (audit task)
- AUDIT ONLY: do not change product code, docs or config. Your only output is `reports/audit/submission-docs.md` (+ screenshots under
  `reports/audit/shots/audit-submission-docs/` if you take any, JPEG, ≤ 300 KB each).
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
Check `README.md`, `docs/TECHNICAL_OVERVIEW.md`, `docs/SUBMISSION_FINAL.md`, `docs/07-submission.md`, `docs/PITCH_SCRIPT.md`,
`docs/VIDEO_SCRIPT.md`, `docs/SECURITY_NOTES.md`, `docs/07-mainnet.md` against the brief and against reality:
(1) the KASE "short technical overview" covers architecture, record-date logic, entitlement calculations, settlement flow,
Solana components, and has an implemented-vs-simulated table; (2) every claim is true today — program id equals
`config/devnet.json`, every `make` target / CLI command / script mentioned exists (`grep` Makefile, clients/ts), numbers
(tests count, CU numbers, instruction count) match the code/reports, live URLs answer 200, plan-15 features (judge sandbox,
curated showcase, /proof page + static export, DvP with accrued interest, autopilot) are described; (3) no placeholders
(`[link]`, `TODO`, `TBD`, `[names…]`, `<…>`), dead relative links (check every markdown link to a repo path exists), or
outdated statements (e.g. "registrar runs without scheduler"); (4) SUBMISSION_FINAL.md has a ready value for every form
field in docs/00-brief.md + 07-submission.md checklists (list fields that need the human: videos, logo, tweet, profiles);
(5) pitch ≤ 2:00 and demo ≤ 3:00 scripts fit (≈150 words/min) and show all 3 required scenarios.

## Finish
`make verify` green (you only add reports). Commit `docs(audit): submission package and docs accuracy` with `task: 91568`, write
`reports/worklog/91568.md` (3 lines), print `DONE:91568` or `BLOCKED:91568 <reason>`.
