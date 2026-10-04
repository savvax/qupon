#!/usr/bin/env bash
# Start N worker loops in one tmux session.
#   CLAUDE_WORKERS=0 GLM_WORKERS=6 FLASH_WORKERS=3 bash ops/tmux.sh     (lead mode: Claude runs interactively, not as a loop)
#   CLAUDE_WORKERS=1 GLM_WORKERS=2 FLASH_WORKERS=1 bash ops/tmux.sh     (fully headless mode)
# Attach: tmux attach -t qupon · stop all after current tasks: touch tasks/.stop · add a worker later:
#   tmux new-window -t qupon -n glm-7 "bash ops/orchestrate.sh glm-7; bash"
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
command -v tmux >/dev/null || { echo "install tmux"; exit 1; }
[ -f .env ] || { echo "create .env from .env.example first"; exit 1; }
CLAUDE_WORKERS="${CLAUDE_WORKERS:-0}"; GLM_WORKERS="${GLM_WORKERS:-4}"; FLASH_WORKERS="${FLASH_WORKERS:-2}"
rm -f tasks/.stop
S=qupon
tmux has-session -t $S 2>/dev/null && { echo "session $S exists; tmux attach -t $S (or tmux kill-session -t $S)"; exit 0; }
tmux new-session -d -s $S -n status "watch -n 30 bash ops/status.sh"
for i in $(seq 1 "$CLAUDE_WORKERS"); do tmux new-window -t $S -n "claude-$i" "bash ops/orchestrate.sh claude-$i; bash"; done
for i in $(seq 1 "$GLM_WORKERS");    do tmux new-window -t $S -n "glm-$i"    "bash ops/orchestrate.sh glm-$i; bash";    sleep 2; done
for i in $(seq 1 "$FLASH_WORKERS");  do tmux new-window -t $S -n "flash-$i"  "bash ops/orchestrate.sh flash-$i; bash";  sleep 2; done
echo "started $CLAUDE_WORKERS claude, $GLM_WORKERS glm, $FLASH_WORKERS flash workers: tmux attach -t $S   (stop: touch tasks/.stop)"
