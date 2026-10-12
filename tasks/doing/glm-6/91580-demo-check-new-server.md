---
id: 91580
title: full demo walkthrough on the new production server
agent: glm
tier: T1
depends_on: [1540]
verify: make verify
timeout_min: 150
---
## Goal
Qupon now also runs on a second server: site https://qupon.185-216-25-91.sslip.io, API https://api.185-216-25-91.sslip.io
(fresh database; the showcase autoseeds). Verify that EVERY demo a judge or the demo video uses works there, end to end.

## Read first
`docs/VIDEO_SCRIPT.md` (the demo video path), `docs/PITCH_SCRIPT.md`, `README.md` (judge path), `reports/audit/live-sweep.md`
and `reports/audit/judge-score.md` (how the previous audits walked the old server — same method).

## Do (browser, Playwright; screenshots of every step to `reports/audit/shots/new-server/`, JPEG ≤ 300 KB)
1. Public: landing, /learn, /bonds (4 showcase series incl. the Closed redemption one), each showcase dossier (coupon paid with
   500/1,250/3,250-style entitlements and explorer links; redemption closed with burn; meeting with votes; MCAL announced),
   /proof and /proof/<mint> for each proof mint until "All checks pass" (record the time), /holder lookup, en/ru/kk.
2. Judge sandbox: "Try it in 3 minutes" → follow it until coupon 1 is paid, then run every scenario button on the page
   (DvP trade with accrued, non-KYC transfer refusal, skip funding/default if present) and wait for maturity/close; record
   timings and every tx link (spot-check 3 on explorer). Create at most TWO sandboxes in total (rate limit).
3. Back office via one-click demo sign-in (/login): issuer (series list, new-series wizard up to the review step — do not
   submit more than one series), registrar (dashboard, actions console, KYC queue, trades, reports/print), investor (portfolio,
   meetings — cast a vote only on a sandbox/E2E series, never on a showcase series), admin (users, series settings, system).
4. Every step: HTTP status, console errors, failed requests, untranslated keys, wrong numbers, stuck spinners. Compare with the
   old server (https://qupon.85-192-29-7.sslip.io) where behaviour differs.

## Rules
Read-only except the actions listed (≤ 2 sandboxes, ≤ 1 series, votes only on non-showcase series). Never print secrets. Do not
deploy or touch the servers over ssh. Never name other hackathon participants.

## Output
`reports/audit/new-server-demo.md`: a table step → result (✓/✗, time, evidence), then findings in the audit format
(`### A91580-<k> [P0|P1|P2] …` with Where / Evidence / Fix), ranked; 5-line summary.

## Finish
Commit `docs(audit): demo walkthrough on the new server` (`task: 91580`), write `reports/worklog/91580.md` (3 lines), print
`DONE:91580` or `BLOCKED:91580 <reason>`.
