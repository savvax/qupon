---
id: 1523
title: Go notices + ISO for plan 15 (incl. kk)
agent: glm
tier: T1
depends_on: [1521]
verify: make verify
timeout_min: 180
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1523 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)

## Plan section
### Task 1523: Go notices + ISO for plan 15 (incl. kk)

**Agent:** glm · **Depends on:** 1521 · **Role:** go-backend

**Files:** `internal/notice/notice.go` (+ `renderPCAL`, `renderBMET`, `renderDefault`, `renderCure`; language `kk` for all), golden files `fixtures/notices/{intr,redm,mcal,pcal,bmet,chan,default,cure}.{en,ru,kk}.golden.txt`, `internal/iso20022/seev031.go` (deterministic: every timestamp from chain — `CreDtTm` = action `announced_at`; no `time.Now()`), `api/disclosure.go` (`GET /actions/{pda}/disclosure-hash` → `{hash, onchain, match}`; after `announce` the registrar runs `disclosure:attach` with the seev031 bytes — hook in the announce handlers and the scheduler), seev.036 for bank-routed payouts (`PaidToAgent`) with the agent as account servicer, tests.
- [ ] Commit `feat(registrar): notices for PCAL/BMET/default/cure in en/ru/kk; anchored deterministic seev.031`.

**Acceptance:** goldens pass; generating seev031 twice for the same action yields identical bytes; `make verify` green.

## Resume notes (lead, 2026-10-10 00:27)
- The resume patch `logs/1523-go-notices-iso-kk.20261010-002639.wip.patch` holds ~88 KB of earlier work (two timed-out
  attempts). Review it critically (goldens, kk wording, seev.031 determinism: no `time.Now()`), finish what is missing,
  rebase on main (91522 and 1525 changed api.go/rest.go/openapi.yaml), `make verify`.

## Finish
`make verify` green, commits carry `task: 1523`, `reports/worklog/1523.md` written. Print `DONE:1523` or `BLOCKED:1523 <reason>`.
