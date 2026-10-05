---
id: 034
title: docs/TECHNICAL_OVERVIEW.md (2–3 pages) for the KASE submission
agent: claude
tier: T1
depends_on: [033]
verify: make verify
timeout_min: 45
---
## Goal
The KASE listing asks for a short technical overview covering architecture, record-date logic, entitlement calculations, settlement flow, and Solana components — produce exactly that, with tx links.

## Read first
- docs/00-brief.md (Submission requirements)
- README.md
- reports/demo-full.md

## Steps
1. Headings in the brief's order; 1 diagram (reuse Mermaid), 1 table of instructions, 1 table of accounts, the formula, the brief's worked example with real devnet signatures, the implemented-vs-simulated table, limitations and next steps.
2. Export to PDF as well (`docs/TECHNICAL_OVERVIEW.pdf` via `npx md-to-pdf` or pandoc if available) — optional.

## Acceptance criteria
- [ ] ≤ 3 pages when printed; all links resolve; reviewed by the `reviewer` subagent for unsupported claims.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/034.md`, then print exactly `DONE:034` or `BLOCKED:034 <reason>`.
