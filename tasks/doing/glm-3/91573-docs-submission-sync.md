---
id: 91573
title: submission docs match the shipped product
agent: glm
tier: T1
depends_on: [91568]
verify: make verify
timeout_min: 120
---
## Goal
Fix findings A91568-2 … A91568-11 of `reports/audit/submission-docs.md` and A91566-3 of `reports/audit/brief-compliance.md`
(read both first). Public docs (`README.md`, `docs/TECHNICAL_OVERVIEW.md`, `docs/SUBMISSION_FINAL.md`, `docs/PITCH_SCRIPT.md`,
`docs/VIDEO_SCRIPT.md`, `docs/07-submission.md`) must describe the shipped product and agree with each other.

## Do
- Add the plan-15 features a judge meets first (judge sandbox "Try it in 3 minutes", curated showcase with autopilot,
  /proof with in-browser verification + static export, DvP with accrued interest, holder-signed payout routes, default and
  cure, disclosure hash on-chain, kk locale) to README + TECHNICAL_OVERVIEW + SUBMISSION_FINAL description (≤ 300 words there).
- Recount every number from the source of truth and fix it everywhere: program tests (`cargo test` output), instructions /
  events / error codes (program source), devnet transaction counts (`reports/devnet-proof*.json`), CU figures
  (`reports/cu-benchmarks.md`), pay_batch sizes (code), sweep screenshot counts.
- One implemented-vs-simulated table (TECHNICAL_OVERVIEW is canonical); README/SUBMISSION_FINAL copy it verbatim or link it;
  fix the self-contradicting Squads row.
- SUBMISSION_FINAL: fill "distribution plans" (from the GTM text) and mark the Earn "X link" as `<<FILL: human>>`; keep
  existing `<<FILL>>` for videos/logo (human work) but list all human fields in one checklist at the top.
- Remove leftover placeholders in 07-submission.md drafts (or mark the drafts section "history, superseded").
- README env reference → the real file; KZT vs $ note for the worked example (A91566-3).

## Constraints
Pre-submission (code freeze 2026-10-12 12:00 Almaty). Smallest safe change; never weaken a test; do not deploy; never
print or commit secrets; never name other hackathon participants or compare with them anywhere.

## Finish
Commit with `task: 91573`, write `reports/worklog/91573.md` (3–6 lines), print `DONE:91573` or `BLOCKED:91573 <reason>`.
