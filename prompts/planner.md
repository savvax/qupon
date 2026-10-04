Planner pass (Claude Code, plan mode; use the `/plan-next` skill if present).

Inputs: `docs/05-plan.md` (tiers, gates, day plan), `tasks/todo/`, `tasks/doing/`, `tasks/done/`, `tasks/failed/`, `HUMAN_TODO.md` (answers), `reports/worklog/*.md`, `reports/questions/*.md`, `reports/nightly-*.md`, `git log --since=24h --oneline`, the current date/time in Asia/Almaty.

Produce ONLY changes to `tasks/todo/*.md` and an entry in `reports/planner-log.md`:
1. Check gates: are we on schedule for Gate 1 (Wed 22:00), Gate 2 (Fri 22:00), Gate 3 (Sun 22:00)? If behind, apply the cut rules in `docs/05-plan.md` by re-tagging tiers (edit `tier:` only) and adding `blocked_reason`/`deferred: true` to T2 tasks.
2. For every `failed/` task: write a replacement task with a sharper scope (split if needed) tagged for the right agent.
3. For every answered item in `HUMAN_TODO.md`: fold the answer into the affected tasks (append a "Decision:" line) and tick the item.
4. Add missing tasks you can justify from the docs (integration glue, tests, docs), as `9NN-<slug>.md` with full frontmatter and acceptance criteria. Never delete or rewrite acceptance criteria of existing tasks; never touch `tasks/done/`.
5. Re-order by renaming ids only within the 9NN range.
Finish with a 10-line summary in `reports/planner-log.md` (date, gate status, what was added/re-tagged, what the human must do next).
