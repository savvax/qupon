---
id: 1401
title: Refuse partial calls (PCAL) off-chain until pool factors exist
agent: glm
tier: T0
depends_on: []
verify: make verify
timeout_min: 45
---
## Goal
A partial call (PCAL, factor_bps < 100%) currently pays only `factor` of face but `complete_action` moves the series to Retiring and `retire_batch` burns 100% of every holder's units (programs/qupon_bonds/src/instructions/settle.rs ~L287-296). Holders lose the unpaid principal. Until the program supports pool factors (task 1402), nothing off-chain may announce a PCAL.

## Read first
- `programs/qupon_bonds/src/instructions/settle.rs` (complete_action), `announce_action.rs` (factor_bps)
- `services/registrar/internal/api/issuer.go` (announce route), `clients/ts/src/commands/action.ts` (announce), web announce UI (grep `PCAL` / `PartialRedemption` in `apps/web/src`)

## Steps
1. Registrar: the announce endpoint rejects kind PCAL with 400 `{"error":"partial calls are not supported yet"}`.
2. CLI `action:announce`: refuse `--kind PCAL` with a JSON error on stdout and exit code 1.
3. Web: remove PCAL from the issuer/registrar announce kind picker (keep display of existing PCAL actions); EN+RU copy unchanged otherwise.
4. Docs: note in `docs/03-domain.md` next to the PCAL lifecycle line that PCAL is disabled pending pool-factor support (task 1402).

## Acceptance criteria
- Go test: POST announce with kind PCAL → 400, executor never called.
- TS test: CLI announce PCAL → exit 1, stdout JSON has `ok:false`.
- Web: no PCAL option in the announce form (e2e or unit assertion).
- `make verify` green; `reports/worklog/1401.md`.

## Out of scope
Program changes (1402).
