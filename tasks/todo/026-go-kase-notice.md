---
blocked_reason: rebase conflict with main
id: 026
title: KASE-style disclosure notice generator (EN/RU) + endpoint
agent: flash
tier: T1
depends_on: [020, 048]
verify: make verify
timeout_min: 30
---
## Goal
Generate the news item KASE would publish, from on-chain state — judges will recognize the format.

## Read first
- docs/03-domain.md (§7 templates)
- https://kase.kz/en/information/news/show/1577089 (format reference)

## Steps
1. `internal/notice`: templates for INTR, REDM, MCAL, CHAN; ordinal helper (1st/2nd/3rd, 1-й); amounts with thousands separators and currency; `GET /actions/{pda}/notice?lang=en|ru` returns text/markdown.
2. Golden tests for all four kinds in both languages against `fixtures/notices/*.golden.txt` (task 048).

## Acceptance criteria
- [ ] Notice for the demo coupon reads like the KASE sample and contains ISIN, ticker, amount, record date, payment date, holder count, tx links.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/026.md`, then print exactly `DONE:026` or `BLOCKED:026 <reason>`.
