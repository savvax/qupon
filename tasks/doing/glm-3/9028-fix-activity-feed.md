---
id: 9028
title: Fix activity feed — newest events, lossless backfill, u64 as strings, make api program id
agent: glm
tier: T1
depends_on: [028]
verify: make verify
timeout_min: 40
---
## Goal
Review of task 028 found the activity feed returns the oldest events and can drop events.

## Read first
- services/registrar/internal/store/activity.go, services/registrar/internal/ingest/ingest.go, Makefile (`api` target), services/registrar/cmd/registrar/main.go

## Steps
1. `store.ListActivity(limit)`: return the NEWEST `limit` rows in chain order: `SELECT * FROM (SELECT … ORDER BY id DESC LIMIT ?) ORDER BY id ASC`. Test: insert limit+1 rows, assert the newest row is present and the oldest is not.
2. `ingest`: when a cursor exists, page `getSignaturesForAddress` backwards (`before=`) until the cursor signature is reached — never skip signatures; keep the 2000 cap only for the very first run (empty cursor). Test with a fake RPC returning 3 pages.
3. Event payloads: serialize every u64 amount/units field as a decimal string (JS loses precision above 2^53). Update tests.
4. `make api`: source `.env` if present and default `PROGRAM_ID` to `jq -r .programId config/devnet.json`; `main.go` logs a warning when PROGRAM_ID is empty (poller disabled).

## Acceptance criteria
- [ ] New tests for 1–3 pass; `make verify` green.
