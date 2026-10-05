---
id: 9126
title: KASE notice — real transaction links instead of the <TX_SIGNATURE> placeholder
agent: glm
tier: T1
depends_on: [9026, 9128]
verify: make verify
timeout_min: 30
---
## Goal
`GET /actions/{pda}/notice` renders "transaction(s): https://explorer.solana.com/tx/<TX_SIGNATURE>…" — the notice must link the real settlement transactions.

## Read first
- services/registrar/internal/notice/{notice.go,reader.go}, internal/store/activity.go, internal/ingest/events.go (events carry `action` and the tx signature), internal/api/api.go (notice route)

## Steps
1. Give `notice.Reader` an optional `Activity` source (interface with a method returning signatures of events for an action PDA, e.g. `EntitlementPaid` and `ActionCompleted`, newest last); `store.Store` implements it from the activity table.
2. `FetchAction` fills `Data.TxLinks` (deduplicated, at most 5; when none are known yet, keep the current placeholder text but say "see explorer for action <pda>").
3. Wire it in `cmd/registrar/main.go` (store passed to the reader).
4. Test: fake activity source with two signatures → both explorer links appear in the EN and RU notice.

## Acceptance criteria
- [ ] Notice shows real explorer links when the activity feed has the action's payment events; `make verify` green.
