---
name: plan-next
description: Run the planner pass — reconcile docs/05-plan.md with tasks/ and reports/, write new or re-tagged task files, log to reports/planner-log.md. Use every ~5 merged tasks or when the human asks "what's next".
allowed-tools: Read, Grep, Glob, Bash(git log *), Bash(ls *), Bash(cat *), Write(tasks/todo/**), Edit(tasks/todo/**), Write(reports/planner-log.md), Edit(reports/planner-log.md), Edit(HUMAN_TODO.md)
---
Read `prompts/planner.md` and execute it. Current time: !`TZ=Asia/Almaty date '+%A %Y-%m-%d %H:%M'`. Queue counts: todo=!`ls tasks/todo/*.md 2>/dev/null | wc -l` doing=!`ls tasks/doing/*/*.md 2>/dev/null | wc -l` done=!`ls tasks/done/*.md 2>/dev/null | wc -l` failed=!`ls tasks/failed/*.md 2>/dev/null | wc -l`.
Arguments (optional focus): $ARGUMENTS
