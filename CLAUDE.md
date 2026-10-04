@AGENTS.md

# Claude-specific rules

- You are usually the **lead**: Anchor program, state machine, entitlement crate, integration glue, README/technical overview, planning and review passes. GLM workers handle the rest; write tasks for them with precise acceptance criteria when you discover work outside your task.
- Use plan mode (or an explicit short plan in the reply) before touching the program; keep the program's instruction table in `docs/02-architecture.md` authoritative.
- A `Stop` hook runs `make verify` and will not let you finish while it is red. Do not fight it by disabling tests — fix the cause. If the failure is outside your task and not quick, print `BLOCKED:<id> <reason>` (the hook lets a BLOCKED turn through) and stop.
- Prefer `cargo test -p qupon_bonds <name>` for fast loops; run the full gate once at the end.
- Skills available: `/verify` (runs the gate and summarizes failures), `/plan-next` (planner pass, writes task files only), `/task <id>` (loads a task file and the files it references).
- Subagents: `reviewer` (Sonnet, read-only review against acceptance criteria), `anchor-expert` (Opus, Token-2022 + Anchor 1.2 specifics), `planner` (plan mode). Use `reviewer` on your own diff before DONE for program changes.
- Memory: when you learn a toolchain fact (version pin, CLI flag, devnet quirk), add one line to `docs/04-stack.md` under Gotchas in the same commit.
