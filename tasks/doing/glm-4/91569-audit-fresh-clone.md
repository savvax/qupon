---
id: 91569
title: fresh-clone reproducibility
agent: glm
tier: T1
depends_on: [1540]
verify: make verify
timeout_min: 150
---
## Goal
Pre-submission readiness audit (2026-10-12, code freeze 12:00 Almaty, submission 20:00): fresh-clone reproducibility. Output: `reports/audit/fresh-clone.md`.

## Rules (audit task)
- AUDIT ONLY: do not change product code, docs or config. Your only output is `reports/audit/fresh-clone.md` (+ screenshots under
  `reports/audit/shots/audit-fresh-clone/` if you take any, JPEG, ≤ 300 KB each).
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
Clone the repo into a temp dir OUTSIDE the repo (`git clone "$PWD" /tmp/qupon-fresh-91569`), and follow README's
quickstart literally as a judge would, without your existing node_modules/target/.env: install steps, `make doctor`,
`make verify` (record duration + result), the web in mock mode (`pnpm dev` or what README says) and the mock e2e suite,
`make demo --dry-run`-style commands that need no keys. Record every step: command, result, time, and every missing or
undocumented prerequisite / wrong command / version mismatch. Delete the temp clone at the end. Do not use keys or .env.

## Finish
`make verify` green (you only add reports). Commit `docs(audit): fresh-clone reproducibility` with `task: 91569`, write
`reports/worklog/91569.md` (3 lines), print `DONE:91569` or `BLOCKED:91569 <reason>`.
