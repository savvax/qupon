---
id: 033
title: README.md: product, architecture (Mermaid), record-date logic, formulas, settlement flow, Solana components, implemented-vs-simulated, run/test/demo instructions
agent: claude
tier: T1
depends_on: [019, 027]
verify: make verify
timeout_min: 60
---
## Goal
The README is the first thing every judge reads; it must answer the KASE 'technical overview' bullets and Colosseum's 'did significant work' check.

## Read first
- docs/00-brief.md (submission requirements)
- docs/01-product.md
- docs/02-architecture.md
- docs/03-domain.md
- reports/demo-full.md

## Steps
1. Use `docs/diagrams/*.mmd` (task 055) if present. Sections: one-liner + screenshot/gif; the problem (3 numbers with sources); what Qupon does (the four verbs); scenarios with links to `reports/demo-full.md` transactions; architecture (Mermaid: UI → Go API → qupon CLI → program → Token-2022; Go reads via RPC); record-date mechanism (pause + snapshot + hash); entitlement math (formula + the brief's example + link to fixtures and tests by name); settlement flow (escrow, batches, tax vault, reconcile); Solana components (program id, PDAs, extensions, Pausable, PermanentDelegate, MintCloseAuthority, events); ISO 20022 + KASE notice; **Implemented vs simulated table**; quickstart (bootstrap, `make verify`, `make demo`); devnet addresses; roadmap (Token ACL, Squads, SAS, confidential payments, mainnet); team + license (MIT).
2. Keep claims honest: thresholds configurable, XSD validation out of scope, devnet only.

## Acceptance criteria
- [ ] README renders on GitHub without broken links; every claim about tests references an existing test name; the implemented-vs-simulated table matches docs/01-product.md.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/033.md`, then print exactly `DONE:033` or `BLOCKED:033 <reason>`.
