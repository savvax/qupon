---
id: 91585
title: registrar — one shared RPC cool-down after a 429 instead of per-call retries
agent: glm
tier: T1
depends_on: [1540]
verify: make verify
timeout_min: 90
---
## Goal
The primary server now reads public devnet (`api.devnet.solana.com`; the keyed RPC's quota is spent). Under a judge's
sandbox the IP trips public devnet's limits: in 12 min the registrar logged 1250 × `Connection rate limits exceeded` and
64 × `Too many requests for a specific RPC call` (JSON-RPC code 429, now detected by `isRateLimited`). Each caller
(scheduler, ingest, API handlers) backs off on its own, so the others keep opening connections and the IP never cools
down. Make the backoff shared.

## Do
1. `services/registrar/internal/chain/client.go` `withRetry`: a client-wide "cool down until" timestamp (atomic or under
   a mutex). When any call gets a rate-limited error, push it to `now + rateLimitBackoff(...)` (never move it earlier).
   Before every RPC attempt (first attempts too), wait until that time (respect `ctx`). Keep today's per-call attempt
   counts and the non-429 linear retry unchanged.
2. Same for `internal/ingest` if it has its own retry around the RPC (grep it); one shared mechanism, not two
   different ones — reuse the chain one if the ingest poller already goes through `chain.Client`/`withRetry`.
3. Log the cool-down once per episode (`rpc rate-limited, cooling down`, `until`), not once per call.
4. Tests (fake RPC with httptest, mirror `client_test.go`): after one call is rate-limited, a second concurrent call
   does not hit the server until the cool-down passes (shrink the base via the existing `rateLimitBase` field);
   a non-429 failure does not start a cool-down. Keep every existing test green.

## Constraints
Post-freeze reliability fix: smallest safe change, registrar only; no behaviour change other than callers waiting
together after a 429; never print the RPC URL or key; do not deploy; never name other hackathon participants.

## Finish
Commit `fix(registrar): shared RPC cool-down after a 429` (`task: 91585`), write `reports/worklog/91585.md`, print
`DONE:91585` or `BLOCKED:91585 <reason>`.
