#!/usr/bin/env bash
# Run ONE task with the right agent inside the current directory (a git worktree).
# usage: ops/run_task.sh <claude|glm|flash> <task-file> <log-prefix>
# Prints the agent's output to stdout (captured by the orchestrator) and logs to <log-prefix>.*
set -uo pipefail
export QUPON_WORKER=1
AGENT="$1"; TASK="$2"; LOGP="$3"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "$ROOT/ops/lib.sh"
[ -f "$ROOT/.env" ] && set -a && source "$ROOT/.env" && set +a

ID=$(task_id "$TASK")
TIMEOUT_MIN=$(task_timeout "$TASK")
PROMPT="$(cat "$ROOT/prompts/worker-preamble.md")
$(cat "$TASK")

When finished print exactly one final line: DONE:$ID  (or BLOCKED:$ID <reason>)."

# `timeout` is GNU coreutils; on macOS install with `brew install coreutils` (gtimeout)
TMO=$(command -v timeout || command -v gtimeout || true)
run_with_timeout() { if [ -n "$TMO" ]; then "$TMO" "${TIMEOUT_MIN}m" "$@"; else "$@"; fi; }

case "$AGENT" in
  claude)
    MODEL="${CLAUDE_WORKER_MODEL:-opus}"
    # Max subscription: uses /login credentials (or CLAUDE_CODE_OAUTH_TOKEN on a headless box). No --bare.
    # Inside a container you may add --dangerously-skip-permissions; outside, acceptEdits + allowed tools is the documented path.
    HELP=$(claude --help 2>/dev/null || true)
    EXTRA=()
    grep -q -- '--permission-prompts' <<<"$HELP" && EXTRA+=(--permission-prompts none)
    if grep -q -- '--append-system-prompt-file' <<<"$HELP"; then EXTRA+=(--append-system-prompt-file "$ROOT/prompts/claude-rules.md"); else EXTRA+=(--append-system-prompt "$(cat "$ROOT/prompts/claude-rules.md")"); fi
    [ "${CLAUDE_BYPASS:-0}" = "1" ] && EXTRA+=(--dangerously-skip-permissions)   # ONLY inside an isolated container
    run_with_timeout claude -p "$PROMPT" \
      --model "$MODEL" \
      --max-turns "${CLAUDE_MAX_TURNS:-120}" \
      --permission-mode acceptEdits "${EXTRA[@]}" \
      --allowedTools "Bash(make *)" "Bash(cargo *)" "Bash(anchor *)" "Bash(go *)" "Bash(pnpm *)" "Bash(npx *)" "Bash(node *)" "Bash(solana *)" "Bash(spl-token *)" "Bash(surfpool *)" "Bash(git add *)" "Bash(git commit *)" "Bash(git status *)" "Bash(git diff *)" "Bash(git log *)" "Bash(git rev-parse *)" "Bash(rg *)" "Bash(ls *)" "Bash(cat *)" "Bash(jq *)" "Bash(mkdir *)" "Bash(cp *)" "Bash(mv *)" "Bash(bash ops/*)" "Bash(./ops/*)" "Bash(pnpm tsx *)" "Edit" "Write" "Read" "Glob" "Grep" "Agent" \
      --disallowedTools "Bash(git push *)" "WebSearch" \
      --output-format json 2>"$LOGP.err" | tee "$LOGP.json" | jq -r '.result // empty' 2>/dev/null
    ;;
  glm)
    run_with_timeout pi -p --provider zai --model "${GLM_MODEL:-glm-5.3:high}" -a --no-session \
      -t read,bash,edit,write,grep,find,ls \
      --append-system-prompt "$ROOT/prompts/roles/$(task_role_file "$TASK")" \
      "$PROMPT" 2>"$LOGP.err" | tee "$LOGP.txt"
    ;;
  flash)
    run_with_timeout pi -p --provider zai --model "${FLASH_MODEL:-glm-5.3-flash}" --thinking low -a --no-session \
      -t read,bash,edit,write,grep,find,ls \
      "$PROMPT" 2>"$LOGP.err" | tee "$LOGP.txt"
    ;;
  *) echo "unknown agent $AGENT" >&2; exit 2;;
esac
rc=$?
# Agents must commit on the worktree's task branch. Tasks 045/048 were "merged" empty because the agent committed
# on a self-made branch; recover by fast-forwarding the task branch, otherwise refuse with BLOCKED.
BR="task/$(basename "$TASK" .md)"; CUR=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
if [ -n "$CUR" ] && [ "$CUR" != "$BR" ]; then
  if git checkout -q "$BR" 2>/dev/null && git merge -q --ff-only "$CUR" 2>/dev/null; then
    echo "[run_task] agent committed on '$CUR'; fast-forwarded $BR to it" >&2
  else
    echo "BLOCKED:$ID agent committed on branch $CUR instead of $BR (work kept on $CUR)"
  fi
fi
exit $rc
