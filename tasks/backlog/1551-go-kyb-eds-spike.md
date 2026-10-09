---
id: 1551
title: KYB via НУЦ РК e-signature (spike)
agent: glm
tier: T2
depends_on: []
verify: make verify
timeout_min: 90
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1551 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)

## Plan section
### Task 1551: KYB via НУЦ РК e-signature (spike)
Go `internal/eds`: verify a CMS signature over a server challenge with a GOST 34.10-2015 certificate chained to the NCA RK test root; extract БИН/ИИН and signer role OIDs (1.2.398.3.3.4.1.2.1/.2); on success issue the SAS attestation with `method = NCA_EDS`. Exit with `BLOCKED:1551` if no pure-Go GOST implementation verifies the NCA test vectors within 3 hours.

## Finish
`make verify` green, commits carry `task: 1551`, `reports/worklog/1551.md` written. Print `DONE:1551` or `BLOCKED:1551 <reason>`.
