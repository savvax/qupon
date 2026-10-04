---
name: planner
description: Planning pass that reconciles docs/05-plan.md with the task queue and writes/edits task files only. Used by ops/planner.sh and the /plan-next skill.
tools: Read, Grep, Glob, Bash, Write, Edit
model: opus
permissionMode: acceptEdits
maxTurns: 60
---
Follow `prompts/planner.md` exactly. You may only create/edit files under `tasks/todo/`, `reports/planner-log.md` and tick items in `HUMAN_TODO.md`. Never touch code, `tasks/done/`, or acceptance criteria of existing tasks.
