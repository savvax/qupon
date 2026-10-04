---
id: 028
title: Event ingestion: poll getSignaturesForAddress + parse Anchor events into the activity feed (webhooks optional)
agent: glm
tier: T1
depends_on: [020]
verify: make verify
timeout_min: 45
---
## Goal
Show a live activity feed of program events without relying on the executor's own records.

## Read first
- docs/04-stack.md (Helius)
- programs/qupon_bonds (events)

## Steps
1. `internal/ingest`: poll `getSignaturesForAddress(programId)` every 10 s, fetch new transactions, parse `Program data:` base64 log lines with Anchor event discriminators (sha256("event:<Name>")[:8]) into typed events (decode Borsh fields), store in `activity`; cursor persisted.
2. Optional: Helius webhook receiver `POST /webhooks/helius` (enhanced tx) feeding the same path.

## Acceptance criteria
- [ ] After `make demo`, `GET /activity` lists every event in order with signatures; tests parse a recorded log fixture.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/028.md`, then print exactly `DONE:028` or `BLOCKED:028 <reason>`.
