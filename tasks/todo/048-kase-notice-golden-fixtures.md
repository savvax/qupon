---
id: 048
title: Golden texts for KASE-style notices (EN/RU) for INTR, REDM, MCAL, CHAN
agent: flash
tier: T1
depends_on: [001]
verify: make verify
timeout_min: 20
---
## Goal
Target outputs for the notice generator (task 026), written from real KASE headlines.

## Read first
- docs/03-domain.md (§7)
- https://kase.kz/en/information/news/show/1577089
- https://kase.kz/ru/information/news/show/1568446

## Steps
1. `fixtures/notices/{intr,redm,mcal,chan}.{en,ru}.golden.txt` using the brief's coupon numbers and a placeholder tx link; a `fixtures/notices/README.md` listing the template variables.

## Acceptance criteria
- [ ] 8 files present; variables consistent with §7 placeholders.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/048.md`, then print exactly `DONE:048` or `BLOCKED:048 <reason>`.
