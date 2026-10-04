# 06 — Continuous multi-agent workflow

Three kinds of workers pull from one file queue; a bash orchestrator verifies and merges. Nothing merges on an agent's word — only on a green `make verify` run by the orchestrator.

## Roles

| Role | Runtime | Tag in task frontmatter | Typical work |
|---|---|---|---|
| Lead / architect | Claude Code (Max, Opus) — one instance | `agent: claude` | Anchor program, state machine, entitlement crate, tricky integration, README/technical overview, planning passes |
| Builder ×2 | pi + GLM-5.3 (`--model glm-5.3:high`) | `agent: glm` | TS client/CLI, Go service, web app, tests, scripts |
| Janitor ×1 | pi + GLM-5.3-Flash (`--thinking low`) | `agent: flash` | lint/format fixes, docs sections, CI yaml, daily reports, notice templates |
| Reviewer | Claude Code subagent `reviewer` (Sonnet, fresh context) | run by `ops/review.sh` | diff vs acceptance criteria → JSON verdict; `fail` → fix task |
| Planner | Claude Code, plan mode, `plan-next` skill | run by `ops/planner.sh` every 5 merges | reconcile `docs/05-plan.md` with `tasks/done`, append tasks, never delete |

## Queue
`tasks/todo/NNN-slug.md` → `tasks/doing/<worker>/` → `tasks/done/` or `tasks/failed/`. Claim = atomic `mv` under `flock tasks/.lock`. A task is claimable when all `depends_on` ids are in `tasks/done/`. Lower numbers first.

Task file format:
```markdown
---
id: 012
title: pay_batch and complete_action
agent: claude            # claude | glm | flash
tier: T0                 # T0 | T1 | T2
depends_on: [011]
verify: make verify      # command the orchestrator runs before merging
timeout_min: 60
---
## Goal
## Read first
## Steps
## Acceptance criteria   (checkable; the reviewer uses these)
## Out of scope
```

## Lifecycle of one task (`ops/orchestrate.sh <worker>`)
1. claim → `git worktree add -B task/<id> .worktrees/<worker> main`; copy `.env`.
2. run agent with prompt = `prompts/worker-preamble.md` + task body + footer "finish with `DONE:<id>` or `BLOCKED:<id> <reason>`" (timeouts: claude 60 min, glm 45, flash 20).
3. agent reads `AGENTS.md`, `docs/`, implements, runs `make verify`, commits on the branch.
4. orchestrator runs `make verify` itself in the worktree; if green and `DONE:<id>` printed → `git rebase main` → `git merge --ff-only` → task → `done/` → optional `git push origin main` (`AUTO_PUSH=1`).
5. failure → retry counter; after 2 failures on glm/flash the task is re-tagged `agent: claude`; after 2 failures on claude → `tasks/failed/` + line in `HUMAN_TODO.md`.
6. `BLOCKED:` → task back to `todo/` with `blocked_reason` added, a line in `HUMAN_TODO.md`, and the orchestrator skips it until the file is edited (mtime changes).
7. usage-limit detection (`hit your … limit`, `rate_limit`, `429`) → task back to `todo/`, sleep with doubling backoff (60 s → 1 h).

## Gates in the agents themselves
- Claude: `.claude/settings.json` has a `Stop` hook (`ops/hooks/stop-verify.sh`) that blocks finishing while `make verify` is red (guarded by `stop_hook_active`, block cap raised to 15), a `PostToolUse` formatter hook, and deny rules (`git push --force`, `rm -rf`, reading `.env`).
- pi: `.pi/extensions/verify-loop.ts` runs `make verify` on `agent_before_settle`; red → appends the tail as a message and continues (max 3 rounds).

## Periodic passes
- `ops/review.sh` (every 5 merges or hourly): reviewer subagent on `main..HEAD~5`; findings → `tasks/todo/9NN-fix-*.md` tagged by complexity.
- `ops/planner.sh` (every 5 merges): Claude in plan mode with `/plan-next`; may append tasks, re-order, split; never deletes `done/`.
- `ops/nightly.sh` (03:00 Almaty): `make demo` on devnet → `reports/nightly-YYYY-MM-DD.md`; Flash writes `reports/daily-YYYY-MM-DD.md` (what merged, what failed, what's blocked, questions for the human).

## Human interface
- `HUMAN_TODO.md`: the orchestrator folds agents’ `reports/questions/<id>.md` files into it (keys, decisions, accounts); the human answers inline and the planner folds answers into tasks.
- `ops/status.sh`: board (todo/doing/done/failed counts, current worker tasks, last 10 merges, limit sleeps).
- Daily 30–60 min: read status + daily report, run `make demo`, answer HUMAN_TODO, record 1‑minute update.

## Budget rules
- One Claude worker only (Max 5‑hour + weekly windows are shared with claude.ai). Opus for `agent: claude` tasks, Sonnet for review, `--max-turns` always.
- Z.ai legacy Pro: ~400 prompts / 5 h, ~2,000 / week; each `pi -p` run ≈ 1 prompt; GLM‑5.3 costs 3× at peak (Mon–Fri 11:00–15:00 Astana) — `ops/orchestrate.sh` defers `agent: glm` tasks during peak unless `FORCE_PEAK=1`; Flash runs anytime.
- Agents never touch mainnet, never commit secrets, never push to any branch but `task/*` (the orchestrator merges and pushes `main`).

## Safety
pi has no permission system; Claude's unattended modes are documented for isolated environments. Run workers as a dedicated Linux user or in `ops/Dockerfile`; keep real keys out of the box (devnet keypairs only).
