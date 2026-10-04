#!/usr/bin/env bash
# Start all worker loops in one tmux session. Attach with `tmux attach -t qupon`. Stop all with `touch tasks/.stop`.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
command -v tmux >/dev/null || { echo "install tmux"; exit 1; }
[ -f .env ] || { echo "create .env from .env.example first"; exit 1; }
rm -f tasks/.stop
S=qupon
tmux has-session -t $S 2>/dev/null && { echo "session $S exists; tmux attach -t $S"; exit 0; }
tmux new-session -d -s $S -n claude-1 "bash ops/orchestrate.sh claude-1; bash"
tmux new-window -t $S -n glm-1   "bash ops/orchestrate.sh glm-1; bash"
tmux new-window -t $S -n glm-2   "bash ops/orchestrate.sh glm-2; bash"
tmux new-window -t $S -n flash-1 "bash ops/orchestrate.sh flash-1; bash"
tmux new-window -t $S -n status  "watch -n 30 bash ops/status.sh"
echo "started: tmux attach -t $S   (stop: touch tasks/.stop)"
