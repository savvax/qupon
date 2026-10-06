---
id: 053
title: T2: Mollusk compute-unit benchmarks for snapshot_batch / pay_batch and batch-size tuning
agent: glm
tier: T2
depends_on: [011]
verify: make verify
timeout_min: 40
---
## Goal
Numbers for the technical overview: CU per holder, max safe batch sizes.

## Read first
- docs/04-stack.md (Mollusk)
- programs/qupon_bonds

## Steps
1. `programs/qupon_bonds/benches/` with mollusk-svm; report CU for 1/5/8/10 holders per batch; adjust constants if a batch exceeds 1.4M CU; write `reports/cu-benchmarks.md`.

## Acceptance criteria
- [ ] Report committed; constants justified.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/053.md`, then print exactly `DONE:053` or `BLOCKED:053 <reason>`.
