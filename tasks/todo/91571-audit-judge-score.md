---
id: 91571
title: judge's scoring pass and top gaps to first place
agent: glm
tier: T1
depends_on: [1540]
verify: make verify
timeout_min: 150
---
## Goal
Pre-submission readiness audit (2026-10-12, code freeze 12:00 Almaty, submission 20:00): judge's scoring pass and top gaps to first place. Output: `reports/audit/judge-score.md`.

## Rules (audit task)
- AUDIT ONLY: do not change product code, docs or config. Your only output is `reports/audit/judge-score.md` (+ screenshots under
  `reports/audit/shots/audit-judge-score/` if you take any, JPEG, ≤ 300 KB each).
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
Act as a strict KASE judge with 5 minutes per project. Walk the judge journey on prod exactly as a stranger: landing →
"Try it in 3 minutes" sandbox (create ONE) → a showcase dossier → /proof → technical overview. Time each step; screenshot
the first screen of each. Then score Qupon 1–10 on each KASE criterion (Technical Execution 30%, Corporate Action Logic 25%,
Product & UX 20%, Real-World Applicability 15%, Innovation 10%) with 2–3 concrete justifications each (what impressed, what
would cost points), and compute the weighted score. Read `docs/research/03-colosseum-superteam-rules-and-winners.md` for what
past winners shipped and compare. Finish with the TOP 10 changes that would most raise the score, each with: criterion,
expected gain, effort (S ≤ 1 h / M ≤ 4 h / L), and whether it is code (fits before the 2026-10-12 12:00 Almaty code freeze)
or human work (video, pitch, repo visibility, submission text).

## Finish
`make verify` green (you only add reports). Commit `docs(audit): judge's scoring pass and top gaps to first place` with `task: 91571`, write
`reports/worklog/91571.md` (3 lines), print `DONE:91571` or `BLOCKED:91571 <reason>`.
