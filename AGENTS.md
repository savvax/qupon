# AGENTS.md — rules for every agent working in this repo (Claude Code and pi read this file)

## What we are building
Qupon: a corporate-actions engine for tokenized bonds on Solana devnet for the KASE × Superteam Kazakhstan side track of Colosseum Crypto World's Fair. Deadline **2026-10-13 11:59 Asia/Almaty**; target submission 2026-10-12 20:00. Read, in this order, before your first change: `docs/00-brief.md`, `docs/01-product.md`, `docs/02-architecture.md`, `docs/03-domain.md`, `docs/04-stack.md`. `docs/05-plan.md` has the day plan, `docs/06-workflow.md` the queue mechanics.

## Non-negotiables
1. **Correctness of corporate-action logic beats features.** The vectors in `fixtures/entitlement.json` must pass everywhere (Rust crate, on-chain tests, Go). Rounding is half-up per holder. Record date = transfer-hook gate (new series) or pause the mint (legacy series), snapshot on-chain; crank steps are permissionless.
2. **`make verify` must be green before you say DONE.** Run it yourself. Never weaken a test to make it pass; never skip a failing test; never `#[ignore]` without a task saying so.
3. **Devnet only.** Never touch mainnet. Never commit secrets (`.env`, keypair JSON, API keys). Public keys and program ids go to `config/devnet.json`.
4. **Follow `docs/02-architecture.md` names and layouts.** If you must deviate, update that doc in the same commit and explain in your DONE note.
5. **Small, reviewable commits** on your task branch with messages `feat(scope): …` / `fix` / `test` / `docs` / `chore`, body = what and why, and the task id (`task: 012`). Do not push. The orchestrator merges and pushes.
6. **Say what is simulated.** Any simulated integration (KYC, ARDFM registration, Swift delivery, fiat) must be labelled `SIMULATED` in code comments, UI and docs.
7. **English** in code, comments, docs, UI strings (RU notice template is the one exception).

## Repo map
`programs/qupon_bonds` (Anchor 1.2 program) · `crates/entitlement` (pure math) · `clients/ts` (Kit + Codama client, `qupon` CLI, scripts) · `services/registrar` (Go) · `apps/web` (Next.js) · `fixtures/` (shared test vectors) · `config/` · `docs/` · `tasks/` `prompts/` `ops/` `.claude/` `.pi/` (workflow; not product) · `reports/` (demo/nightly output) · `HUMAN_TODO.md` (questions for the human).

## Commands
- `make verify` — the gate: `anchor build` + `cargo test` (LiteSVM) + `cargo clippy -D warnings` + `cargo fmt --check` + `go build/test/vet` + `golangci-lint` + `pnpm -r typecheck lint test`.
- `make build`, `make test-program`, `make test-go`, `make test-ts`, `make client` (Codama), `make deploy` (devnet), `make demo-coupon`, `make demo` (full lifecycle → `reports/`), `make doctor` (toolchain check).
- Targets that need the network or keys are skipped in `make verify` (they read `config/devnet.json` and `.env`).

## Coding rules
- **Rust/Anchor**: Anchor 1.2 idioms (`#[derive(Accounts)]`, `token_interface`, `InterfaceAccount`), checked math (`checked_*` or u128 + `try_into`), explicit error codes from `docs/02-architecture.md`, every instruction has at least one happy-path and one failure LiteSVM test; emit events on every state transition; no `unwrap()` in program code; box large accounts.
- **TypeScript**: `@solana/kit` 8 (no web3.js 1.x outside `apps/web` wallet glue), strict TS, generated code only via `pnpm codama` (never hand-edit `src/generated`), CLI outputs JSON on stdout and logs on stderr, exit code ≠ 0 on failure.
- **Go**: 1.26, `go vet` + `golangci-lint` clean, table tests, context everywhere, no global state, errors wrapped with `%w`, exec of the `qupon` CLI isolated in `internal/executor` with timeouts.
- **Web**: Next.js app router, Tailwind, server components for reads, wallet-adapter only for signing; every action step shows its tx signature with an explorer link (`https://explorer.solana.com/tx/<sig>?cluster=devnet`).
- **Tests use the brief's numbers** (10/25/65 units, 1,000 KZT face, 10% semi-annual → 500/1,250/3,250 and 10,000 principal).

## Task protocol
- You receive ONE task file. Do only that task. Acceptance criteria are the definition of done.
- First read the task's "Read first" list. Then plan briefly in your reply, then implement.
- If something outside your task is broken and blocks you: fix it minimally if < 15 minutes, otherwise write `BLOCKED:<id> <reason>` and stop.
- If you need a decision from the human (credentials, product choice), write it to `reports/questions/<id>-<slug>.md` (one file per task; the orchestrator folds it into `HUMAN_TODO.md`) and either continue with the stated default or print `BLOCKED:`. Never edit `HUMAN_TODO.md` directly.
- Finish with exactly one line: `DONE:<id>` (verify green, committed) or `BLOCKED:<id> <reason>`. Before DONE, write `reports/worklog/<id>.md` (3–6 lines: what changed, decisions taken, what to watch) and commit it with your code.
- Never edit files under `tasks/done/`, `tasks/doing/` or `HUMAN_TODO.md`. Never delete tasks. You may add follow-up tasks to `tasks/todo/` as `9<your-id>-<slug>.md` (e.g. `9012-fix-pay-batch.md`) with the frontmatter from `docs/06-workflow.md`.

## Context hygiene
Keep replies short; don't paste whole files into the conversation; read only what the task needs; prefer `rg` to broad listings; after large changes, run the narrowest test first, then `make verify`.
