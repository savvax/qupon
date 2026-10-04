---
name: task
description: Load a task by id from tasks/ (todo or doing) together with its "Read first" files and restate the acceptance criteria as a checklist. Use at the start of any task run: /task 012
allowed-tools: Read, Glob, Grep, Bash(ls *), Bash(cat *)
argument-hint: <task id>
---
Find the task file: !`ls tasks/todo/$ARGUMENTS-*.md tasks/doing/*/$ARGUMENTS-*.md 2>/dev/null | head -1`. Read it, then read every file in its "Read first" list (skip URLs). Reply with: the goal in one line, the acceptance criteria as a checklist, the files you will touch, and the first test you will write. Then start the work.
