---
id: 91549
title: "design pre-flight (Opus review): landing first impression and copy"
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 180
---
## Goal
Task 1537's Opus design review (`reports/design/preflight/opus-review.md`) found what still keeps Qupon's screens
below the design bar. Implement findings **3, 5, 13, 14** exactly as specified there — each finding names the screen, the defect,
the exact change (files, tokens/classes, en/ru/kk copy) and why it matters to judges.

## Read first
- `reports/design/preflight/opus-review.md` — your findings (3, 5, 13, 14) and the "Task grouping" section (your file list and gate)
- `docs/design/language.md`; the screenshots the review used: `reports/design/preflight/opus/`
- apps/web/e2e/sweep.spec.ts (`SWEEP_OUT`, `SWEEP_ROUTES`) for re-shots

## Scope (from the review's grouping — touch only these files; other tasks own the rest)
- Files: `app/(public)/_landing/Hero.tsx`, `app/(public)/_landing/HeroLifecycle.tsx`,
     `app/(public)/_landing/sections.tsx`, `messages/{en,ru,kk}.json` (landing.* keys only),
     `messages/{en,ru,kk}/learn.json`, `messages/kk/kit.json`.
   - Gate: locale-stability, the messages parity test, re-shots of `/` at en/ru/kk × 1440/390.

## Do
- Implement each listed finding; if one is impossible as written, implement the closest equivalent and explain it in
  `reports/design/preflight/fixes.md` (`#<finding> — …`).
- en/ru/kk strict key parity; kk is the longest — check it at 390.
- Re-shoot the screens named in your gate with `SWEEP_OUT=reports/design/preflight/opus-after` and commit them.

## Acceptance
Every listed finding implemented (or explained); the gate in the grouping passes; `make verify` green.
Commit `fix(web): design pre-flight — landing first impression and copy` (`task: 91549`).

## Finish
Write `reports/worklog/91549.md` (3–6 lines), commit with `task: 91549`, print `DONE:91549` or `BLOCKED:91549 <reason>`.
