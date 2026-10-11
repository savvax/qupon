---
id: 91570
title: security and repo hygiene
agent: glm
tier: T1
depends_on: [1540]
verify: make verify
timeout_min: 150
---
## Goal
Pre-submission readiness audit (2026-10-12, code freeze 12:00 Almaty, submission 20:00): security and repo hygiene. Output: `reports/audit/security-hygiene.md`.

## Rules (audit task)
- AUDIT ONLY: do not change product code, docs or config. Your only output is `reports/audit/security-hygiene.md` (+ screenshots under
  `reports/audit/shots/audit-security-hygiene/` if you take any, JPEG, ≤ 300 KB each).
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
(1) Secrets: scan the FULL git history (`git log -p --all` streamed through grep, plus `make secrets-scan` if present) for
keypair JSON arrays (64 numbers), base58 secret keys, API keys, keyed RPC URLs (`api-key=`, helius), passwords/ADMIN_TOKEN
values, `.env` files ever committed — report only the commit + path + kind, NEVER the value. (2) Runtime config: no mainnet
RPC/program anywhere in runtime paths; devnet guards present (`!mainnet` in sandbox wiring). (3) Prod API read-only probe:
list routes from `services/registrar/internal/api` router; GET each admin/registrar/issuer route WITHOUT auth → must be
401/403; check security headers on site + API (HSTS, X-Content-Type-Options, frame-ancestors/X-Frame-Options), CORS
answers, error bodies leaking internals (stack traces, file paths, SQL). (4) Program: re-read `docs/SECURITY_NOTES.md`
and check each listed mitigation still holds in `programs/qupon_bonds` (signer/owner checks on every instruction, checked
math, no `unwrap()`); list any instruction missing a failure-path test.

## Finish
`make verify` green (you only add reports). Commit `docs(audit): security and repo hygiene` with `task: 91570`, write
`reports/worklog/91570.md` (3 lines), print `DONE:91570` or `BLOCKED:91570 <reason>`.
