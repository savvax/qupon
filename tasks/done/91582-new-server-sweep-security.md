---
id: 91582
title: new primary server — full route sweep and security probe
agent: glm
tier: T1
depends_on: [1540]
verify: make verify
timeout_min: 150
---
## Goal
Repeat the old server's audits on the NEW primary server: site https://qupon.185-216-25-91.sslip.io, API
https://api.185-216-25-91.sslip.io. Method and checklists: `reports/audit/live-sweep.md` (task 91567) and the production part of
`reports/audit/security-hygiene.md` (task 91570) — read both first and follow them, so results are comparable.

## Do
1. Sweep (91567 method): every public route and every demo-sign-in cabinet route × en/ru/kk × 1440/390 — HTTP status, console
   errors, failed requests, raw i18n keys / untranslated enums, English on ru/kk, overflow at 390, broken images, NaN/undefined/
   Invalid Date, inconsistent number formats; HEAD-check every external link (explorer links must be devnet). /proof/<mint> for
   each proof mint: time to "All checks pass".
2. Security probe (91570 prod part): every admin/registrar/issuer/me API route WITHOUT auth → 401/403; security headers on the
   site and the API (HSTS, nosniff, frame options, referrer policy); CORS answers; error bodies must not leak internals; TLS
   certificates valid for both hosts.
3. Note any difference from the old server's reports (fixed / new / regressed).

## Rules
GET and browsing only; no POST/PUT/DELETE beyond the demo sign-in; no sandbox creation (task 91580 does that); never print
secrets; no ssh; never name other hackathon participants. A request that times out from this machine: retry 3× before calling it
a finding (this Mac's VPN drops ~7 % of connections; server-side probes showed 0 failures).

## Output
`reports/audit/new-server-sweep.md` in the audit format (`### A91582-<k> [P0|P1|P2] …`, Where / Evidence / Fix), ranked; 5-line
summary. Screenshots of defects only → `reports/audit/shots/new-server-sweep/`.

## Finish
Commit `docs(audit): new server sweep and security probe` (`task: 91582`), write `reports/worklog/91582.md` (3 lines), print
`DONE:91582` or `BLOCKED:91582 <reason>`.
