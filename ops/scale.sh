#!/usr/bin/env bash
# Add or remove GLM/Flash workers on the fly.   usage: ops/scale.sh glm 8   |  ops/scale.sh flash 3
# Removing: creates tasks/.stop-<worker> files for the extra workers (they exit after the current task).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
KIND="${1:?glm|flash}"; N="${2:?target count}"
running=$(tmux list-windows -t qupon -F '#W' 2>/dev/null | grep -c "^$KIND-" || true)
if [ "$N" -gt "$running" ]; then
  for i in $(seq $((running+1)) "$N"); do rm -f "tasks/.stop-$KIND-$i"; tmux new-window -t qupon -n "$KIND-$i" "bash ops/orchestrate.sh $KIND-$i; bash"; sleep 2; done
elif [ "$N" -lt "$running" ]; then
  for i in $(seq $((N+1)) "$running"); do touch "tasks/.stop-$KIND-$i"; done
fi
echo "$KIND workers: $running -> $N"
