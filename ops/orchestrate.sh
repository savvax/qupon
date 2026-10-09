#!/usr/bin/env bash
# Worker loop: claim → worktree → run agent → independent verify → serialized rebase + ff-merge → next.
# usage: ops/orchestrate.sh <worker-name>   e.g. glm-1 … glm-10 | flash-1 … | claude-1
# One instance per worker (ops/tmux.sh starts N of them). Stop all: `touch tasks/.stop`.
#
# Invariants (hold for any number of workers):
#  - every operation on the ROOT repo (queue moves, queue commits, rebase, ff-merge, push) runs under the `git` lock;
#  - main's working tree is always clean: the orchestrator commits queue moves and human notes itself;
#  - agents commit only on their task branch inside .worktrees/<worker>; they never push;
#  - a task is merged only if the orchestrator's own `make verify` is green in the worktree (run outside the lock).
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
log "[$WORKER] started (agent=$AGENT, AUTO_PASSES=${AUTO_PASSES:-1}, GLM_PEAK_WORKERS=${GLM_PEAK_WORKERS:-4})"

while :; do
  [ -f "$TASKS/.stop" ] && { log "[$WORKER] stop file found; exiting"; exit 0; }
  [ -f "$TASKS/.stop-$WORKER" ] && { rm -f "$TASKS/.stop-$WORKER"; log "[$WORKER] scaled down; exiting"; exit 0; }
  if peak_idle "$WORKER"; then sleep 300; continue; fi
  TASK=$(claim "$AGENT" "$WORKER" || true)
  if [ -z "$TASK" ]; then sleep $((30 + RANDOM % 30)); continue; fi
  ID=$(task_id "$TASK"); NAME=$(basename "$TASK" .md)
  WT="$ROOT/.worktrees/$WORKER"; BR="task/$NAME"
  log "[$WORKER] claimed $NAME"

  # fresh worktree from main (worktree add touches refs → under the git lock)
  lock git
  git worktree remove --force "$WT" >/dev/null 2>&1 || true
  # A directory left without its git metadata (an interrupted remove) makes `worktree add` fail on every claim:
  # move it out of the way (2026-10-10: glm-1/6/7/8/11 looped on "cannot create worktree").
  [ -e "$WT" ] && mv "$WT" "${TMPDIR:-/tmp}/qupon-orphan-$WORKER-$(date +%s)" 2>/dev/null
  git worktree prune >/dev/null 2>&1 || true
  git branch -D "$BR" >/dev/null 2>&1 || true
  if ! git worktree add -B "$BR" "$WT" main >/dev/null 2>&1; then
    unlock git; log "[$WORKER] cannot create worktree; requeue"; requeue "$TASK"; sleep 120; continue
  fi
  unlock git
  cp "$ROOT/.env" "$WT/.env" 2>/dev/null || true
  mkdir -p "$WT/reports/worklog" "$WT/reports/questions" "$WT/logs"

  LOGP="$LOGS/$NAME.$(date +%Y%m%d-%H%M%S)"
  OUT=$( cd "$WT" && bash "$ROOT/ops/run_task.sh" "$AGENT" "$TASK" "$LOGP" 2>>"$LOGP.err" ); rc=$?
  printf '%s\n' "$OUT" > "$LOGP.out"

  if hit_limit "$LOGP.out" || hit_limit "$LOGP.err"; then
    log "[$WORKER] usage/rate limit; requeue $NAME; sleep ${backoff}s"
    requeue "$TASK"; lock git; git worktree remove --force "$WT" >/dev/null 2>&1 || true; unlock git
    sleep "$backoff"; backoff=$(( backoff < 3600 ? backoff * 2 : 3600 )); continue
  fi
  backoff=60

  if grep -q "BLOCKED:$ID" "$LOGP.out"; then
    REASON=$(grep -m1 "BLOCKED:$ID" "$LOGP.out" | sed "s/.*BLOCKED:$ID *//")
    log "[$WORKER] $NAME BLOCKED: $REASON"
    mkdir -p "$ROOT/reports/questions"; cp "$WT"/reports/questions/*.md "$ROOT/reports/questions/" 2>/dev/null || true
    add_blocked "$TASK" "$REASON"; requeue "$TASK"
    lock git; _fold_questions_nolock; _human_todo_nolock "($ID) BLOCKED by $WORKER: $REASON — fix, then delete the blocked_reason line in tasks/todo/$NAME.md."; git worktree remove --force "$WT" >/dev/null 2>&1 || true; unlock git
    continue
  fi

  CLEAN=$( cd "$WT" && git status --porcelain | wc -l | tr -d ' ' )
  if [ $rc -eq 0 ] && grep -q "DONE:$ID" "$LOGP.out" && [ "$CLEAN" = "0" ] && ( cd "$WT" && make verify >"$LOGP.verify" 2>&1 ); then
    # ---- Opus review gate (outside the git lock): reject → feedback into the task, work kept as a resume patch ----
    if review_gate "$AGENT"; then
      bash "$ROOT/ops/review_task.sh" "$TASK" "$WT" "$LOGP"; rv=$?
      if [ $rv -ne 0 ]; then
        save_branch_patch "$WT" "$LOGP"
        if [ $rv -eq 1 ]; then
          r=$(review_rounds "$ID"); bump_review_rounds "$ID"
          append_review "$TASK" "$LOGP.review.md" $((r+1))
          if [ "$r" -ge 2 ] && [ "$AGENT" != "claude" ]; then
            log "[$WORKER] $NAME rejected 3x by review; escalating to claude"; set_agent "$TASK" claude
          fi
          log "[$WORKER] $NAME REJECTED by review (round $((r+1))); requeue"
        else
          log "[$WORKER] $NAME review unavailable; requeue and back off ${backoff}s"
        fi
        requeue "$TASK"
        lock git; git worktree remove --force "$WT" >/dev/null 2>&1 || true; git branch -D "$BR" >/dev/null 2>&1 || true; unlock git
        [ $rv -eq 2 ] && { sleep "$backoff"; backoff=$(( backoff < 3600 ? backoff * 2 : 3600 )); }
        continue
      fi
    fi
    # ---- critical section: rebase onto the current main and fast-forward, nobody else touches main meanwhile ----
    lock git
    _commit_queue_nolock "pre-merge $NAME"
    MERGED=0
    if ( cd "$WT" && git rebase main >/dev/null 2>&1 ); then
      if git merge --ff-only "$BR" >/dev/null 2>&1; then MERGED=1; fi
    else ( cd "$WT" && git rebase --abort >/dev/null 2>&1 || true ); fi
    if [ "$MERGED" = "1" ]; then
      mv "$TASK" "$TASKS/done/"; echo x >> "$MERGES_FILE"
      mkdir -p "$ROOT/reports/questions"; _fold_questions_nolock
      _commit_queue_nolock "done $NAME"
      log "[$WORKER] MERGED $NAME ($(git rev-parse --short HEAD))"
      [ "${AUTO_PUSH:-0}" = "1" ] && { git push -q origin main 2>/dev/null || log "[$WORKER] push failed (ignored)"; }
      git worktree remove --force "$WT" >/dev/null 2>&1 || true; git branch -D "$BR" >/dev/null 2>&1 || true
      N_MERGES=$(wc -l < "$MERGES_FILE" | tr -d ' ')
      unlock git
      # periodic passes (claude -p): only when AUTO_PASSES=1 and only from the first worker of each kind, every 5 merges
      if [ "${AUTO_PASSES:-1}" = "1" ] && [ "$(worker_index "$WORKER")" = "1" ] && [ $(( N_MERGES % 5 )) -eq 0 ]; then
        ( bash "$ROOT/ops/review.sh" 5 >>"$LOGS/review.log" 2>&1 || true )
        ( bash "$ROOT/ops/planner.sh" >>"$LOGS/planner.log" 2>&1 || true )
      fi
      continue
    else
      # the rebase onto main conflicted after verify passed on an older base: keep the branch for a human/lead
      add_blocked "$TASK" "rebase conflict with main"; mv "$TASK" "$TASKS/todo/"
      _human_todo_nolock "($ID) rebase conflict on $BR (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason."
      _commit_queue_nolock "conflict $NAME"
      git worktree remove --force "$WT" >/dev/null 2>&1 || true
      unlock git
      log "[$WORKER] rebase conflict on $NAME"
      continue
    fi
  else
    n=$(retries "$ID"); bump_retries "$ID"
    log "[$WORKER] $NAME failed (rc=$rc clean=$CLEAN retry=$((n+1))); see $LOGP.*"
    if [ "$n" -lt 2 ]; then requeue "$TASK"
    elif [ "$AGENT" != "claude" ]; then log "[$WORKER] escalating $NAME to claude"; set_agent "$TASK" claude; echo 0 > "$TASKS/.retries-$ID"; requeue "$TASK"
    else fail "$TASK"; human_todo "($ID) FAILED 3× on claude — see $LOGP.* — split, drop, or do by hand."; fi
    lock git; git worktree remove --force "$WT" >/dev/null 2>&1 || true; git branch -D "$BR" >/dev/null 2>&1 || true; unlock git
  fi
done
