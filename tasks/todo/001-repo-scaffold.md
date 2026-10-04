---
id: 001
title: Monorepo scaffold: Anchor workspace, pnpm workspace, Go module, Makefile wiring
agent: claude
tier: T0
depends_on: []
verify: make verify
timeout_min: 60
---
## Goal
Create the repository skeleton exactly as `docs/02-architecture.md` describes so that every later task has a place to land and `make verify` runs (and passes) on an empty-but-valid tree.

## Read first
- AGENTS.md
- docs/02-architecture.md
- docs/04-stack.md
- Makefile

## Steps
1. `anchor init` is NOT used (it creates a nested repo); instead create `Anchor.toml` ([toolchain] anchor_version = "1.2.0", [programs.devnet] qupon_bonds, [provider] cluster = devnet, wallet = ~/.config/qupon/registrar.json), root `Cargo.toml` workspace with members `programs/*`, `crates/*`; `programs/qupon_bonds` with `lib.rs` containing `declare_id!` + one `ping` instruction and a LiteSVM test that calls it (template from `anchor init --test-template litesvm` copied in).
2. Dump Token-2022 for LiteSVM: `solana program dump TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb tests/fixtures/spl_token_2022.so -u devnet` (if the network is unavailable, add a `make fixtures` target and a clear error).
3. `crates/entitlement` library crate with an empty `lib.rs` and a test that loads `fixtures/entitlement.json` (serde) — tests are added in task 003.
4. `package.json` + `pnpm-workspace.yaml` with `clients/ts` and `apps/web`; `clients/ts` has `tsconfig.json` (strict), `package.json` scripts `typecheck`, `lint` (eslint flat config), `test` (vitest), `codama`, `build`; dependencies `@solana/kit@^8.4`, `@solana-program/token-2022@^0.19`, `@solana-program/token@^0.17`, `@solana-program/system@^0.15`, `commander`, dev `codama`, `@codama/nodes-from-anchor`, `@codama/renderers-js`, `tsx`, `vitest`.
5. `services/registrar/go.mod` (go 1.25, module `github.com/<org>/qupon/services/registrar` — use placeholder org `qupon-kz`), `cmd/registrar/main.go` printing version, `internal/` package dirs, `.golangci.yml` (default linters + errcheck, govet, staticcheck).
6. `ops/doctor.sh` prints versions of solana, anchor, cargo, node, pnpm, go, pi, surfpool and exits non-zero if solana ≠ 4.3.x or anchor ≠ 1.2.x.
7. GitHub Actions workflow `.github/workflows/ci.yml` running `make verify` (install Agave 4.3.0 + avm 1.2.0 + Node 22 + Go 1.25; cache cargo).
8. README.md stub with the project one-liner and the implemented-vs-simulated table copied from `docs/01-product.md` (marked WIP).

## Acceptance criteria
- [ ] `make doctor` prints all versions and exits 0 on the bootstrap machine.
- [ ] `make verify` exits 0 and prints `VERIFY OK` (ping test passes under LiteSVM; Go builds; TS typechecks).
- [ ] `git status` clean after commit; no `target/`, `node_modules/` committed.

## Out of scope
No business logic. No web app yet (apps/web is created in task 032).

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/001.md`, then print exactly `DONE:001` or `BLOCKED:001 <reason>`.
