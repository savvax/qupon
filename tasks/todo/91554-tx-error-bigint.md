---
id: 91554
title: CLI hides on-chain errors behind "Do not know how to serialize a BigInt"
agent: flash
tier: T1
depends_on: []
verify: make verify
timeout_min: 120
---
## Goal
On production the autopilot logs `qupon: [action:announce] transaction failed: Do not know how to serialize a BigInt` —
`clients/ts/src/lib/tx.ts:121` (`JSON.stringify(status.err)`) and `tx.ts:39` (`JSON.stringify(e.context)`) throw on BigInt
values that @solana/kit puts in transaction errors (e.g. `{ InstructionError: [0, { Custom: 6007n }] }`), so the real
program error (InvalidDates, …) never reaches the logs or the console.

## Do
- A small `jsonSafe(value)` (BigInt → string) in tx.ts used by both stringify calls; keep the existing Anchor error-name
  extraction working (`InvalidDates (6007)` must still appear).
- Unit test: an error object with a BigInt custom code produces a message containing `6007` (and the Anchor name when
  logs carry it), never the serialization error.

## Acceptance
`pnpm --filter @qupon/client test` green; `make verify` green. Commit `fix(cli): show on-chain errors that carry BigInt codes`
(`task: 91554`).

## Finish
Write `reports/worklog/91554.md` (3–6 lines), commit with `task: 91554`, print `DONE:91554` or `BLOCKED:91554 <reason>`.
