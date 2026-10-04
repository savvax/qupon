#!/usr/bin/env bash
# Worker loop: claim → worktree → run agent → independent verify → ff-merge → next.
# usage: ops/orchestrate.sh <worker-name>   e.g. claude-1 | glm-1 | glm-2 | flash-1
# One instance per worker (ops/tmux.sh starts them). Stop with Ctrl-C or `touch tasks/.stop`.
#
# Invariants:
#  - main's working tree is always clean: the orchestrator commits queue moves and human notes itself.
#  - agents commit only on their task branch inside .worktrees/<worker>; they never push.
#  - a task is merged only if the orchestrator's own `make verify` is green in the worktree.
set -uo pipefail
WORKER="${1:?worker name like glm-1}"
AGENT="${WORKER%-*}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "$ROOT/ops/lib.sh"
[ -f "$ROOT/.env" ] && set -a && source "$ROOT/.env" && set +a
cd "$ROOT"
git rev-parse --verify main >/dev/null 2>&1 || { echo "branch 'main' required"; exit 1; }

MERGES_FILE="$LOGS/merges.count"; touch "$MERGES_FILE"
backoff=60
log "[$WORKER] started (agent=$AGENT)"

while :; do
  [ -f "$TASKS/.stop" ] && { log "[$WORKER] stop file found; exiting"; exit 0; }
  commit_queue "tick" >/dev/null 2>&1
  TASK=$(claim "$AGENT" "$WORKER" || true)
  if [ -z "$TASK" ]; then sleep 60; continue; fi
  commit_queue "claim $(basename "$TASK")"
  ID=$(task_id "$TASK"); NAME=$(basename "$TASK" .md)
  WT="$ROOT/.worktrees/$WORKER"; BR="task/$NAME"
  log "[$WORKER] claimed $NAME"

  git worktree remove --force "$WT" >/dev/null 2>&1 || true
  git branch -D "$BR" >/dev/null 2>&1 || true
  if ! git worktree add -B "$BR" "$WT" main >/dev/null 2>&1; then
    log "[$WORKER] cannot create worktree; requeue"; requeue "$TASK"; sleep 120; continue
  fi
  cp "$ROOT/.env" "$WT/.env" 2>/dev/null || true
  mkdir -p "$WT/reports/worklog" "$WT/reports/questions" "$WT/logs"

  LOGP="$LOGS/$NAME.$(date +%Y%m%d-%H%M%S)"
  OUT=$( cd "$WT" && bash "$ROOT/ops/run_task.sh" "$AGENT" "$TASK" "$LOGP" 2>>"$LOGP.err" ); rc=$?
  printf '%s\n' "$OUT" > "$LOGP.out"

  if hit_limit "$LOGP.out" || hit_limit "$LOGP.err"; then
    log "[$WORKER] usage/rate limit; requeue $NAME; sleep ${backoff}s"
    requeue "$TASK"; git worktree remove --force "$WT" >/dev/null 2>&1 || true
    sleep "$backoff"; backoff=$(( backoff < 3600 ? backoff * 2 : 3600 )); continue
  fi
  backoff=60

  # fold any question files the agent wrote (they are committed on the branch; copy before cleanup)
  if ls "$WT"/reports/questions/*.md >/dev/null 2>&1; then
    mkdir -p "$ROOT/reports/questions"; cp "$WT"/reports/questions/*.md "$ROOT/reports/questions/" 2>/dev/null || true
  fi

  if grep -q "BLOCKED:$ID" "$LOGP.out"; then
    REASON=$(grep -m1 "BLOCKED:$ID" "$LOGP.out" | sed "s/.*BLOCKED:$ID *//")
    log "[$WORKER] $NAME BLOCKED: $REASON"
    add_blocked "$TASK" "$REASON"; requeue "$TASK"
    fold_questions; human_todo "($ID) BLOCKED by $WORKER: $REASON — fix, then delete the blocked_reason line in tasks/todo/$NAME.md."
    git worktree remove --force "$WT" >/dev/null 2>&1 || true
    continue
  fi

  CLEAN=$( cd "$WT" && git status --porcelain | wc -l | tr -d ' ' )
  if [ $rc -eq 0 ] && grep -q "DONE:$ID" "$LOGP.out" && [ "$CLEAN" = "0" ] && ( cd "$WT" && make verify >"$LOGP.verify" 2>&1 ); then
    commit_queue "pre-merge $NAME"
    if ( cd "$WT" && git rebase main >/dev/null 2>&1 ) && git merge --ff-only "$BR" >/dev/null 2>&1; then
      finish "$TASK"; echo x >> "$MERGES_FILE"; fold_questions; commit_queue "merged $NAME"
      log "[$WORKER] MERGED $NAME ($(git rev-parse --short HEAD))"
      [ "${AUTO_PUSH:-0}" = "1" ] && { git push -q origin main 2>/dev/null || log "[$WORKER] push failed (ignored)"; }
      if [ $(( $(wc -l < "$MERGES_FILE") % 5 )) -eq 0 ]; then
        ( bash "$ROOT/ops/review.sh" 5 >>"$LOGS/review.log" 2>&1 || true )
        ( bash "$ROOT/ops/planner.sh" >>"$LOGS/planner.log" 2>&1 || true )
      fi
    else
      ( cd "$WT" && git rebase --abort >/dev/null 2>&1 || true )
      log "[$WORKER] rebase/merge conflict on $NAME"
      add_blocked "$TASK" "rebase conflict with main"; requeue "$TASK"
      human_todo "($ID) rebase conflict on $BR (branch kept) — resolve by hand or let the planner split; then delete blocked_reason."
      git worktree remove --force "$WT" >/dev/null 2>&1 || true
      continue   # keep the branch for a human
    fi
  else
    n=$(retries "$ID"); bump_retries "$ID"
    log "[$WORKER] $NAME failed (rc=$rc clean=$CLEAN retry=$((n+1))); see $LOGP.*"
    if [ "$n" -lt 2 ]; then requeue "$TASK"
    elif [ "$AGENT" != "claude" ]; then log "[$WORKER] escalating $NAME to claude"; set_agent "$TASK" claude; echo 0 > "$TASKS/.retries-$ID"; requeue "$TASK"
    else fail "$TASK"; human_todo "($ID) FAILED 3× on claude — see $LOGP.* — split, drop, or do by hand."; fi
  fi
  git worktree remove --force "$WT" >/dev/null 2>&1 || true
  git branch -D "$BR" >/dev/null 2>&1 || true
done
