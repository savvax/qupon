---
id: 050
title: Web UI kit: StatusChip, ExplorerLink, SimulatedBadge, AmountCell, Timeline, DataTable, Toast
agent: glm
tier: T1
depends_on: [029]
verify: make verify
timeout_min: 45
---
## Goal
Operator-grade primitives used by the action page and portal; one place to get the look right.

## Read first
- apps/web
- docs/02-architecture.md (Web app)
- prompts/roles/frontend.md

## Steps
1. `apps/web/components/ui/*`: StatusChip (all 10 action statuses + series statuses), ExplorerLink (tx/address, short form with copy), SimulatedBadge, AmountCell (right-aligned mono, decimals from currency), Timeline (vertical steps with state + tx), DataTable (sortable, mono columns), Toast; Storybook-free: a `/kitchen-sink` dev page rendering all states.
2. Replace the stubs from task 029 without changing their props.

## Acceptance criteria
- [ ] `pnpm typecheck && pnpm lint` green; `/kitchen-sink` renders every component state.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/050.md`, then print exactly `DONE:050` or `BLOCKED:050 <reason>`.
