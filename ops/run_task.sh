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

# Copy-on-write clone of main's build cache (APFS clonefile: instant, shares blocks until written): registry crates and
# node toolchains are reused, only this worktree's own crates rebuild — no full Rust build per task, little extra disk.
if [ ! -e target ] && [ -d "$ROOT/target" ]; then
  cp -c -R "$ROOT/target" target 2>/dev/null || rm -rf target
  rm -f target/deploy/qupon_bonds-keypair.json   # a symlink to the out-of-repo program keypair in the main tree
fi

ID=$(task_id "$TASK")
TIMEOUT_MIN=$(task_timeout "$TASK")
PROMPT="$(cat "$ROOT/prompts/worker-preamble.md")
$(cat "$TASK")

When finished print exactly one final line: DONE:$ID  (or BLOCKED:$ID <reason>)."

# Resume: a previous attempt that died (connection drop, timeout, dirty exit) left its work as a patch vs main.
# Apply it to this fresh worktree, commit it as WIP and tell the agent to finish instead of starting over.
NAME=$(basename "$TASK" .md)
WIP=$(ls -t "$ROOT"/logs/"$NAME".*.wip.patch 2>/dev/null | head -1 || true)
if [ -n "$WIP" ]; then
  if git apply --index "$WIP" 2>/dev/null && git commit -qm "wip($ID): resume previous attempt" 2>/dev/null; then
    PROMPT="$PROMPT

NOTE: a previous attempt at this task was interrupted. Its work is already applied and committed on this branch as 'wip($ID): resume previous attempt' (see: git show --stat HEAD). Review it, finish what is missing, run make verify, commit and print DONE:$ID."
    echo "[run_task] resumed from $WIP" >&2
  else
    # Main moved on since the patch was taken. Starting fresh threw away whole review rounds (1524/1534 on 2026-10-10):
    # apply it 3-way instead, commit the result with any conflict markers, and make resolving them the first step.
    git reset -q --hard 2>/dev/null
    git apply --3way --index "$WIP" >/dev/null 2>&1
    CONFLICTS=$(git diff --name-only --diff-filter=U 2>/dev/null | tr '\n' ' ')
    git add -A 2>/dev/null
    if ! git diff --cached --quiet 2>/dev/null && git commit -qm "wip($ID): resume previous attempt (3-way onto a newer main)" 2>/dev/null; then
      PROMPT="$PROMPT

NOTE: a previous attempt at this task was interrupted and main has moved on since. Its work is applied 3-way and committed on this branch as 'wip($ID): resume previous attempt (3-way onto a newer main)' (see: git show --stat HEAD)."
      if [ -n "$CONFLICTS" ]; then
        PROMPT="$PROMPT FIRST resolve the conflict markers (<<<<<<< ======= >>>>>>>) it left in: $CONFLICTS — keep main's changes AND this task's changes; for binary files (screenshots) keep main's version and re-shoot later if the task needs it."
      fi
      PROMPT="$PROMPT Then review it, finish what is missing, run make verify, commit and print DONE:$ID."
      echo "[run_task] resumed 3-way from $WIP; conflicts: ${CONFLICTS:-none}" >&2
    else
      git reset -q --hard 2>/dev/null; echo "[run_task] could not apply $WIP even 3-way; starting fresh" >&2
    fi
  fi
  mv "$WIP" "$WIP.applied" 2>/dev/null || true
fi

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
# Timed out after finishing (91501 on 2026-10-09: VERIFY OK, commits and worklog in place, but pi never returned): a
# branch with commits, a clean tree and the task's committed worklog counts as done — the orchestrator's own make verify
# and the Opus review gate still decide whether it merges.
if [ "$rc" -eq 124 ] && [ -z "$(git status --porcelain 2>/dev/null)" ] \
  && [ "$(git rev-list --count main..HEAD 2>/dev/null || echo 0)" -gt 0 ] \
  && git ls-files --error-unmatch "reports/worklog/$ID.md" >/dev/null 2>&1; then
  echo "[run_task] agent timed out after committing its work and worklog; handing it to verify + review" >&2
  echo "DONE:$ID" | tee -a "$LOGP.txt"
  rc=0
fi
# Agents often print DONE and then run gofmt/prettier without committing (023, 9126 were rejected 3× for clean=N).
# Commit the leftovers on the task branch; the orchestrator's own `make verify` still gates the merge.
if [ "$rc" -eq 0 ] && grep -qs "DONE:$ID" "$LOGP".txt "$LOGP".json && [ -n "$(git status --porcelain 2>/dev/null)" ] \
  && [ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" = "$BR" ]; then
  git add -A && git commit -qm "chore: commit changes the agent left uncommitted after DONE

task: $ID" && echo "[run_task] committed leftover changes after DONE" >&2
fi
# Salvage: unless the agent finished cleanly (DONE + clean tree), keep everything it did vs main as a patch for the
# next attempt — the orchestrator deletes this worktree and branch on failure.
if ! grep -qs "DONE:$ID" "$LOGP".txt "$LOGP".json || [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  git add -A 2>/dev/null
  # Diff from the branch point, not current main: main moves while the agent works, and a diff against it would
  # carry reversals of everything merged meanwhile (024's resume reverted 9126 that way). Queue files never travel.
  BASE=$(git merge-base HEAD main 2>/dev/null || echo main)
  if ! git diff --cached --quiet "$BASE" -- . ':(exclude)tasks' 2>/dev/null; then
    git diff --cached --binary "$BASE" -- . ':(exclude)tasks' > "$LOGP.wip.patch" \
      && echo "[run_task] saved work for the next attempt: $LOGP.wip.patch" >&2
  fi
  git reset -q 2>/dev/null
fi
# Diagnostics: the orchestrator rejects a dirty worktree (clean=N); record what was left behind.
DIRTY=$(git status --porcelain 2>/dev/null | head -20)
[ -n "$DIRTY" ] && { echo "[run_task] worktree not clean after agent:"; echo "$DIRTY"; [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ] && echo "[run_task] a rebase is still in progress"; } >&2
exit $rc
