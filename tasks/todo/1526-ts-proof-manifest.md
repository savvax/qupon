---
id: 1526
title: machine-readable proof manifest + verifier
agent: glm
tier: T1
depends_on: [1520]
verify: make verify
timeout_min: 60
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
