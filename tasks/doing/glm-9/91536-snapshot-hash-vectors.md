---
id: 91536
title: cross-language snapshot-hash vectors (scheme 0 rolling, scheme 1 set hash)
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 120
---
## Goal
The snapshot hash is the audit anchor of every corporate action. Pin both schemes with shared vectors and verify them in
Rust, TypeScript and Go, so the proof page, the registrar and the program provably agree.

## Read first
- programs/qupon_bonds/src/instructions/snapshot.rs (scheme 0: rolling sha256 over owner-sorted holders; scheme 1:
  XOR of sha256("qupon:snap:v1" ‖ action ‖ owner ‖ units_le) — confirm the exact preimages in code)
- services/registrar/internal/reconcile/reconcile.go (Go recomputation of both schemes)
- fixtures/entitlement.json (how shared vectors are laid out and consumed)

## Do
- `programs/qupon_bonds/tests/export_fixtures.rs` (or a new test file) writes `fixtures/snapshot_hash.json` when
  `EXPORT_FIXTURES=1`: ≥ 6 cases (1 holder; 3 holders 10/25/65; holders given unsorted; a zero-unit holder; scheme 1
  order independence — same set in two orders → same hash; 20 holders), each `{scheme, action, holders:[{owner, units}],
  hash}` computed by running the real program instructions in LiteSVM (not a re-implementation). Without the env var the
  test asserts the committed file still matches.
- TS: `clients/ts/src/lib/snapshotHash.ts` (`snapshotHash(scheme, action, holders)`) + vitest over the vectors.
- Go: a test in `internal/reconcile` that runs its hash function over the same vectors (refactor the hash computation
  into a small exported helper if needed; no behaviour change).

## Acceptance
All three suites pass on the vectors; `make verify` green. Commit `test(fixtures): cross-language snapshot hash vectors`
(`task: 91536`).

## Finish
Write `reports/worklog/91536.md` (3–6 lines), commit with `task: 91536`, print `DONE:91536` or `BLOCKED:91536 <reason>`.
