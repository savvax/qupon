---
id: 055
title: Mermaid diagrams for README and the technical overview (architecture, CA state machine, record-date snapshot sequence)
agent: flash
tier: T1
depends_on: [019]
verify: make verify
timeout_min: 25
---
## Goal
Pictures for judges; rendered by GitHub natively.

## Read first
- docs/02-architecture.md
- docs/03-domain.md (§5)

## Steps
1. `docs/diagrams/architecture.mmd`, `state-machine.mmd`, `snapshot-sequence.mmd` (sequence diagram: registrar → program → Token-2022 pause → snapshot batches → finalize → resume) and the same embedded as fenced ```mermaid blocks in `docs/diagrams/README.md`; optional PNG export via `npx @mermaid-js/mermaid-cli` if available.

## Acceptance criteria
- [ ] Diagrams render on GitHub; names match the code.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/055.md`, then print exactly `DONE:055` or `BLOCKED:055 <reason>`.
