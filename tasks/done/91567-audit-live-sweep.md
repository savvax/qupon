---
id: 91567
title: live production sweep (routes, locales, errors, links)
agent: glm
tier: T1
depends_on: [1540]
verify: make verify
timeout_min: 150
---
## Goal
Pre-submission readiness audit (2026-10-12, code freeze 12:00 Almaty, submission 20:00): live production sweep (routes, locales, errors, links). Output: `reports/audit/live-sweep.md`.

## Rules (audit task)
- AUDIT ONLY: do not change product code, docs or config. Your only output is `reports/audit/live-sweep.md` (+ screenshots under
  `reports/audit/shots/audit-live-sweep/` if you take any, JPEG, ≤ 300 KB each).
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
Sweep production in a real browser (Playwright; `apps/web/e2e/sweep.spec.ts` lists the routes — run it with
`E2E_BASE_URL=<site>` if it supports live mode, else write a throw-away script OUTSIDE the repo or under
`reports/audit/tools/`): every public route (landing, /bonds, each of the 4 showcase dossiers `/bonds/<mint>`, /proof,
/proof/<mint> for each proof mint, /sandbox/new + one sandbox, /holder, /invite, legal/footer pages) and every cabinet
reachable with the one-click demo sign-in (/login demo roles: issuer, registrar, investor, admin) — en/ru/kk × 1440/390.
Record per page: HTTP status, console errors, failed network requests (4xx/5xx), raw i18n keys or untranslated enums,
English text on ru/kk pages (except proper nouns), horizontal overflow at 390, broken images, empty states that look broken,
"NaN"/"undefined"/"null"/"Invalid Date" text, numbers formatted inconsistently. HEAD-check every external link on the pages
(explorer links resolve to devnet; note GitHub links separately). Screenshot only defective pages.

## Finish
`make verify` green (you only add reports). Commit `docs(audit): live production sweep (routes, locales, errors, links)` with `task: 91567`, write
`reports/worklog/91567.md` (3 lines), print `DONE:91567` or `BLOCKED:91567 <reason>`.
