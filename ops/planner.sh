#!/usr/bin/env bash
# Planner pass: Claude in plan mode reconciles the plan with reality and writes task files only.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; source "$ROOT/ops/lib.sh"
[ -f "$ROOT/.env" ] && set -a && source "$ROOT/.env" && set +a
cd "$ROOT"
fold_questions
PROMPT="$(cat "$ROOT/prompts/planner.md")

Now: $(TZ=Asia/Almaty date '+%A %Y-%m-%d %H:%M') Asia/Almaty. Queue: todo=$(ls tasks/todo/*.md 2>/dev/null | wc -l | tr -d ' ') doing=$(ls tasks/doing/*/*.md 2>/dev/null | wc -l | tr -d ' ') done=$(ls tasks/done/*.md 2>/dev/null | wc -l | tr -d ' ') failed=$(ls tasks/failed/*.md 2>/dev/null | wc -l | tr -d ' ')."
claude -p "$PROMPT" --model "${CLAUDE_WORKER_MODEL:-opus}" --max-turns 60 --permission-mode acceptEdits --permission-prompts none \
  --allowedTools "Read" "Grep" "Glob" "Bash(git log *)" "Bash(ls *)" "Bash(cat *)" "Write(tasks/todo/**)" "Edit(tasks/todo/**)" "Write(reports/planner-log.md)" "Edit(reports/planner-log.md)" "Edit(HUMAN_TODO.md)" \
  --output-format json > "$LOGS/planner.$(date +%Y%m%d-%H%M%S).json" 2>>"$LOGS/planner.err" || log "[planner] claude failed"
commit_queue "planner pass"
log "[planner] done"
