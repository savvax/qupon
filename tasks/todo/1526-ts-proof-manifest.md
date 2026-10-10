---
id: 1526
title: machine-readable proof manifest + verifier
agent: glm
tier: T1
depends_on: [1520]
verify: make verify
timeout_min: 180
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1526 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)

## Plan section
### Task 1526: machine-readable proof manifest + verifier

**Agent:** glm · **Depends on:** 1520 · **Role:** ts-client

**Files:** `clients/ts/scripts/lib/proof.ts` (shared writer), use in `demo-full.ts`, `demo-coupon.ts`, `demo-squads.ts`, trade scenario; `clients/ts/src/commands/proof.ts` (`proof:verify <file>`); schema `fixtures/proof.schema.json`.

Manifest: `{ version: 1, cluster, programId, generatedAt, steps: [{ id, label, signature, slot, instruction, expect: { event?: string, fields?: Record<string,string|number> } }] }` → `reports/devnet-proof.json` (+ per-script `reports/devnet-proof-<kind>.json`). `proof:verify` fetches each tx (`getTransaction` maxSupportedTransactionVersion 0), checks success, that the Qupon program was invoked, decodes Anchor events from logs with the Codama event decoders and compares `expect.fields`; prints `{ok, checked, failed: [...]}`; exit 1 on any failure.
- [ ] Unit test with a recorded tx JSON fixture (no network). Commit `feat(proof): devnet proof manifest and verifier`.

**Acceptance:** test green; `make verify` green; 1540 regenerates real manifests.

## Finish
`make verify` green, commits carry `task: 1526`, `reports/worklog/1526.md` written. Print `DONE:1526` or `BLOCKED:1526 <reason>`.

## Review feedback (round 1, 2026-10-10 09:24) — fix every blocking item first; your previous work is already committed on this branch

### Summary
The verifier and the plumbing are solid. Codama decoding covers all 28 program events, the checks are correctly ordered, the test uses a real recorded tx fixture with meaningful asserts, and the writer is wired into demo-full/coupon/squads and the trade scenario. But no demo script records the expected amounts that spec D10a requires, so every manifest step proves only that an event fired, not how much was paid. The implementation commit is also an unlabelled `wip` commit with no task trailer. Fix both, then this can merge. I could not run the narrow tests (Bash denied in this session); verify status relies on the orchestrator's green gate.

### Blocking
- clients/ts/scripts/lib/proof.ts:74 — Spec D10a says every demo manifest records "steps, signatures, expected amounts". No demo script ever sets `expect.fields`: `ProofWriter.record` only fills `{ event }` from EXPECTED_EVENTS. Every step of every generated manifest therefore checks only the event name, so `proof:verify` reports ✓ on an `action:pay` that paid 1 tiyn instead of 50,000. The field-comparison code exists and is tested, but nothing feeds it, so the proof says nothing about money.
  **Fix:** Record per-holder amount expectations using the brief's numbers, which the scripts already assert. (a) demo-coupon.ts: after the `S1 action:pay` step, for each holder i call `proof.record({ label: `${name} — investor${i+1}`, signatures: [paySig], instruction: "action:pay", expect: { event: "EntitlementPaid", fields: { owner: inv.address, units: Number(HOLDINGS[i]), gross: Number(EXPECTED_GROSS[i]) } } })`. Get `paySig` from `signaturesIn(res)` and throw if it does not hold exactly one signature (3 holders fit in one batch); otherwise pick the batch that contains the owner. Do the same after `action:snapshot` with `HolderSnapshotted { owner, units, gross }` and after each `subscribe` with `Subscribed { owner, units }`. (b) demo-full.ts: same for the QPN INTR #1 coupon (10/25/65 → 50,000/125,000/325,000) and for the trade scenario coupon (15/25/60 units). demo-squads.ts: same for its pay step. (c) In scripts/lib/proof.test.ts, add a case asserting that a recorded pay step carries `expect.fields.gross === 50000` and `fields.owner`. Note: once the per-holder steps exist, the plain event-only pay step becomes redundant; keep it or drop it, but the per-holder steps are required.
- clients/ts/src/commands/proof.ts — The implementation commit is `wip(1526): resume previous attempt` with no body and no `task: 1526` trailer. This breaks AGENTS.md rule 5 (`feat|fix|…(scope): …`, body = what/why + task id) and the plan's required commit `feat(proof): devnet proof manifest and verifier`.
  **Fix:** When committing the fix above, squash 6603fab into it with subject `feat(proof): devnet proof manifest and verifier` and a body that summarises the writer, the verifier and the schema and ends with `task: 1526`. Do not push.

### Acceptance criteria not met
- Spec D10a: manifests carry expected amounts — No caller passes expect.fields, so all generated steps are event-name-only (blocking item 1).
- Commits follow AGENTS.md and carry task: 1526 — 6603fab `wip(1526): resume previous attempt` has no body or task trailer. Only the worklog commit carries `task: 1526`.
