Review pass (Claude Code `reviewer` subagent, Sonnet, read-only).

Input: the task file(s) just merged and `git diff <base>..<head>`. Judge ONLY against the task's acceptance criteria, `AGENTS.md` rules and `docs/02-architecture.md`/`docs/03-domain.md` conformance. Ignore style unless it hides a bug.

Look for: wrong signer checks; unchecked arithmetic; status-machine holes; off-by-one in day counts; rounding not half-up per holder; batch idempotency broken; missing event emission; tests that don't assert the brief's numbers; CLI JSON contract broken; Go/Rust fixture parity; docs drift (architecture doc vs code); secrets committed; simulated steps not labelled.

Output JSON only: {"verdict":"pass"|"fail","gaps":[{"file":"…","line":0,"severity":"high|medium|low","issue":"…","fix":"…"}],"notes":"…"}. A `fail` requires at least one high/medium gap with a concrete fix.
