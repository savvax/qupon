---
id: 91578
title: web polish from the live sweep (board filter, ru notice, enums, ₸)
agent: glm
tier: T1
depends_on: [91567]
verify: make verify
timeout_min: 150
---
## Goal
Fix A91567-3, -4, -5, -7 of `reports/audit/live-sweep.md` (read it first: routes, locales, screenshots).

## Do
- A3: the public board `/bonds` defaults to the "Active" filter and hides the completed redemption showcase (Astana-Metro,
  Closed, featured). Default must show every featured showcase series (e.g. default "All", or featured series always listed);
  keep filters working; update the e2e that pins the default.
- A4: the SIMULATED KASE notice on the RU action page renders in English — render the ru (and kk) template that exists for
  notices (check the registrar's notice templates / web mapping) or label the language fallback explicitly.
- A5: registrar activity log shows raw instruction enums on ru/kk — translate through messages (add keys en/ru/kk).
- A7: ₸ spacing differs between pages — route all tenge amounts through the shared formatter (one spacing rule per locale).

## Constraints
Pre-submission (code freeze 2026-10-12 12:00 Almaty); smallest safe change; en/ru/kk key parity; never weaken a test; no secrets;
do not deploy; never name other hackathon participants.

## Finish
Commit with `task: 91578`, write `reports/worklog/91578.md` (3–6 lines), print `DONE:91578` or `BLOCKED:91578 <reason>`.
