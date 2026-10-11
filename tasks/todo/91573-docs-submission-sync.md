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

## Review feedback (round 1, 2026-10-12 04:38) — fix every blocking item first; your previous work is already committed on this branch

### Summary
The docs now describe the plan-15 judge path. The implemented-vs-simulated table is unified and the submission checklist is complete. Most counts check out against the source: instructions 28, events 28, pay batch 5/4. Two CU claims misread reports/cu-benchmarks.md: the 'worst batch' is not retire 12 at 56,333 CU (the heaviest measured batch is the 5-holder redemption pay_batch at 84,234 CU), and the worst marginal cost per holder is ~14k CU, not 3.7k. Fix those two sentences and this can merge. No web changes, so no screenshot pass was needed.

### Blocking
- docs/TECHNICAL_OVERVIEW.md:99 — The CU figures do not match reports/cu-benchmarks.md, so the acceptance criterion 'recount every number … CU figures' is not met. (1) It says the worst measured batch overall is retire_batch 12 at 56,333 CU. The report has several heavier batches: pay_batch redemption, 5 holders, 84,234 CU; snapshot_batch 8 at 82,790 CU; pay_batch worst case, 5 holders, 78,115 CU. (2) It says an extra holder costs about 3.7k CU in the worst case. 3,686 is the smallest marginal cost in the report (retire). The largest is 14,132 CU (pay_batch worst case, 4 holders).
  **Fix:** Replace the sentence with: "the heaviest batch at the size the CLI sends is `snapshot_batch` with 8 holders at 82,790 CU (13.8% of the 600k limit the CLI sets per transaction); the heaviest measured transaction is a 5-holder redemption `pay_batch` (pay + burn) at 84,234 CU, 6.0% of the 1.4M limit; an extra holder costs at most about 14k CU (pay_batch, Token-2022 cash with tax)."
- docs/02-architecture.md:126 — Batch sizing paragraph: 'the worst measured batch (retire 12) used 56,333 CU, 4.0% of the 1.4M compute limit' is wrong. Several batches in reports/cu-benchmarks.md are heavier, up to 84,234 CU for the redemption pay_batch at 6.0%.
  **Fix:** Change it to 'the heaviest measured batch (pay_batch, 5 holders, redemption pay + burn) used 84,234 CU, 6.0% of the 1.4M compute limit'. Keep the snapshot-8 / 82,790 / 13.8% clause as it is.

### Acceptance criteria not met
- Every number recounted from the source of truth — 28 instructions (lib.rs) and 28 events (events.rs) check out. pay_batch 5/4 matches settle.rs:29 and action.ts:68. 60/20 tx links and 116 tests are taken from the worklog. The CU claims 'worst batch = retire 12 at 56,333' and 'an extra holder costs ~3.7k worst case' contradict cu-benchmarks.md
