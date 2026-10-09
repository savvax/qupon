---
id: 1519
title: program wave integration and devnet deploy (Opus)
agent: claude
tier: T0
depends_on: [1515, 1516]
verify: make verify
timeout_min: 180
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1519 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/02-architecture.md
- docs/03-domain.md
- programs/qupon_bonds/tests/common/mod.rs
- programs/qupon_bonds/tests/hook.rs (transfer-hook gate, spike 1509)

## Plan section
### Task 1519: program wave integration and devnet deploy (Opus)

**Agent:** claude (Opus) · **Depends on:** 1515

- [ ] Opus security pass over `git diff <pre-1510>..HEAD -- programs/` with the `anchor-expert` subagent: signer/role table vs D2, every token CPI destination derivation, pause/resume pairing per batch, overflow, reserved-byte arithmetic. Fix or file `9519-*` tasks.
- [ ] `make build`; extend the program account if the binary grew (`solana program extend QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd <bytes> -u devnet`), top up the registrar from `funder1`; `make deploy`; IDL publish (Helius `RPC_URL`); `pnpm codama`; `QUPON_EXPORT_FIXTURE=1 cargo test -p qupon_bonds --test init_series export_series_fixture`; verified docker build + redeploy + hash update per the end of `reports/verified-build.md`.
- [ ] `make demo` on devnet (S0–S4 still green) and a quick manual demo-clock series: `qupon series:create --demo-day-secs 1 …` → coupon + default + cure + redemption, links into `reports/demo-plan15.md`.
- [ ] Hide pre-plan-15 demo series in `series_settings.hidden` (keep `QPNb1` and `BTRKdemo` visible).

**Acceptance:** devnet program = verified build of `main`; `reports/demo-full.md` regenerated; `reports/demo-plan15.md` shows every new instruction with explorer links.

## Finish
`make verify` green, commits carry `task: 1519`, `reports/worklog/1519.md` written. Print `DONE:1519` or `BLOCKED:1519 <reason>`.
