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

## Review feedback (round 1, 2026-10-11 05:28) — fix every blocking item first; your previous work is already committed on this branch

### Summary
The fix is correct and small: `jsonSafe` uses a BigInt replacer, both stringify sites are switched over, and client tests pass (248/248). It fails one acceptance criterion: the required test only covers the helper, not the error message. Nothing would catch a revert of tx.ts:130, and the Anchor-name-with-BigInt path is untested. Adding two short tests (waitForConfirmation with Custom: 6007n, and sendInstructions with Anchor logs) is enough to merge. No web changes, so no screenshots were taken.

### Blocking
- clients/ts/src/lib/tx.test.ts:126 — The task asks for a unit test showing that a BigInt custom code produces a *message* containing 6007, and never the serialization error. The new test only checks the `jsonSafe` helper. No test sends a BigInt `status.err` through `waitForConfirmation`. If tx.ts:130 went back to `JSON.stringify(status.err)`, the original production bug would return and every test would still pass. The existing 'reports an on-chain failure' test uses the plain number `6006`, not a BigInt.
  **Fix:** Add this test to the `waitForConfirmation` describe: `const primary = statusRpc(() => ({ value: [{ confirmationStatus: "confirmed", err: { InstructionError: [0, { Custom: 6007n }] } }] }));` then `const p = waitForConfirmation(primary, sig, 5_000); await expect(p).rejects.toThrow(/6007/); await expect(p).rejects.not.toThrow(/serialize a BigInt/);`. Check that it fails when line 130 uses plain JSON.stringify.
- clients/ts/src/lib/tx.test.ts:150 — The task also asks the test to show the Anchor name 'when logs carry it'. No test checks that a failed send whose error has Anchor logs plus a BigInt in its context produces a final message containing 'InvalidDates (6007)'.
  **Fix:** Add a `sendInstructions` test. Use a stub rpc whose `sendTransaction().send` rejects with `Object.assign(new Error("Transaction simulation failed"), { context: { logs: ["Program log: AnchorError occurred. Error Code: InvalidDates. Error Number: 6007. Error Message: Invalid dates."], code: 6007n } })`. Reuse the `getLatestBlockhash` stub from the existing test. Assert `await expect(sendInstructions(rpc, payer, [computeUnitLimit(1)], "announce")).rejects.toThrow(/InvalidDates \(6007\)/)` and that the message does not match /serialize a BigInt/.

### Acceptance criteria not met
- Unit test: a BigInt custom code gives a message containing 6007 (and the Anchor name when logs carry it), never the serialization error — Only jsonSafe is tested on its own. waitForConfirmation and sendInstructions have no BigInt error test, so reverting line 130 would not fail any test
