#!/usr/bin/env bash
# Shared helpers for the Qupon agent orchestration. Source this file; do not run it.
# Portable bash 4+; works on Linux and macOS (no flock dependency).
# Designed for N parallel workers (tested with 10): every operation on the ROOT repository (queue moves,
# queue commits, rebase + fast-forward merge, push) is serialized under the single `git` lock.

export PATH="$HOME/.local/share/mise/shims:$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
TASKS="$ROOT/tasks"
LOGS="$ROOT/logs"
mkdir -p "$LOGS" "$TASKS/todo" "$TASKS/doing" "$TASKS/done" "$TASKS/failed"

log() { printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" | tee -a "$LOGS/orchestrator.log" >&2; }

# --- mkdir-based mutex with owner pid (portable, non-reentrant: never nest lock calls of the same name) ---
lock() {   # lock <name> [max_wait_s=600]
  local d="$TASKS/.lock-$1" max="${2:-600}" i=0 owner
  until mkdir "$d" 2>/dev/null; do
    sleep 0.25; i=$((i+1))
    if [ $((i % 4)) -eq 0 ] && [ $((i / 4)) -ge "$max" ]; then
      owner=$(cat "$d/pid" 2>/dev/null || echo "?")
      if ! kill -0 "$owner" 2>/dev/null; then log "lock $1 held by dead pid $owner; breaking"; rm -rf "$d"; else log "lock $1 held by live pid $owner for ${max}s; still waiting"; i=0; fi
    fi
  done
  echo $$ > "$d/pid"
}
unlock() { rm -rf "$TASKS/.lock-$1"; }

# --- frontmatter helpers ---
fm() {     # fm <file> <key>  -> value (without brackets/quotes)
  awk -v k="$2" 'BEGIN{infm=0} NR==1&&$0=="---"{infm=1;next} infm&&$0=="---"{exit} infm&&$0~"^"k":"{sub("^"k":[ ]*","");gsub(/[\[\]"]/,"");print;exit}' "$1"
}
task_id()   { fm "$1" id; }
task_agent(){ fm "$1" agent; }
task_tier() { fm "$1" tier; }
task_timeout(){ local t; t=$(fm "$1" timeout_min); echo "${t:-45}"; }

deps_done() {   # deps_done <file> -> 0 if every depends_on id has a file in done/
  local deps d
  deps=$(fm "$1" depends_on | tr ',' ' ')
  for d in $deps; do
    d=$(echo "$d" | xargs)
    [ -z "$d" ] && continue
    ls "$TASKS/done/${d}-"*.md >/dev/null 2>&1 || return 1
  done
  return 0
}
# A task with a `blocked_reason:` line in its frontmatter is skipped until the human removes that line.

# Z.ai peak hours for GLM-5.3 (3x quota): Mon–Fri 11:00–15:00 Asia/Almaty (= 14:00–18:00 SGT)
is_peak() {
  [ "${FORCE_PEAK:-0}" = "1" ] && return 1
  local dow hour
  dow=$(TZ=Asia/Almaty date +%u); hour=$(TZ=Asia/Almaty date +%H)
  [ "$dow" -le 5 ] && [ "$hour" -ge 11 ] && [ "$hour" -lt 15 ]
}
# worker index from its name (glm-7 -> 7); workers above GLM_PEAK_WORKERS idle during peak hours
worker_index() { echo "${1##*-}"; }
peak_idle() {   # peak_idle <worker> -> 0 if this worker should idle now
  local agent="${1%-*}" idx; idx=$(worker_index "$1")
  [ "$agent" = "glm" ] && is_peak && [ "$idx" -gt "${GLM_PEAK_WORKERS:-4}" ]
}

# --- queue state is committed on main by the orchestrator (never by agents) ---
_commit_queue_nolock() {
  ( cd "$ROOT" && git add -A -- tasks HUMAN_TODO.md 2>/dev/null; git add -A -- reports 2>/dev/null; \
    git diff --cached --quiet || git commit -qm "chore(queue): ${1:-state} [skip ci]" >/dev/null 2>&1 ) || true
}
commit_queue() { lock git; _commit_queue_nolock "$1"; unlock git; }

# claim <agent> <worker> -> prints the claimed file path (now under doing/<worker>/) or nothing
claim() {
  local agent="$1" worker="$2" f
  lock git
  for f in $(ls "$TASKS/todo/"*.md 2>/dev/null | sort); do
    [ "$(task_agent "$f")" = "$agent" ] || continue
    grep -q '^blocked_reason:' "$f" && continue
    [ "$(task_tier "$f")" = "T2" ] && [ "${ALLOW_T2:-0}" != "1" ] && continue
    deps_done "$f" || continue
    mkdir -p "$TASKS/doing/$worker"
    mv "$f" "$TASKS/doing/$worker/"
    _commit_queue_nolock "claim $(basename "$f")"
    unlock git
    echo "$TASKS/doing/$worker/$(basename "$f")"
    return 0
  done
  unlock git
  return 1
}
requeue() { lock git; mv "$1" "$TASKS/todo/";   _commit_queue_nolock "requeue $(basename "$1")"; unlock git; }
fail()    { lock git; mv "$1" "$TASKS/failed/"; _commit_queue_nolock "failed $(basename "$1")";  unlock git; }
# finish is done inside the merge critical section by the orchestrator (see orchestrate.sh)

retries() { local id="$1"; cat "$TASKS/.retries-$id" 2>/dev/null || echo 0; }
bump_retries() { local id="$1" n; n=$(retries "$id"); echo $((n+1)) > "$TASKS/.retries-$id"; }

set_agent() {  # set_agent <file> <agent>
  local tmp; tmp=$(mktemp)
  awk -v a="$2" 'BEGIN{done=0} /^agent:/&&!done{print "agent: " a; done=1; next} {print}' "$1" > "$tmp" && mv "$tmp" "$1"
}
add_blocked() { # add_blocked <file> <reason>
  grep -q '^blocked_reason:' "$1" && return 0
  local tmp; tmp=$(mktemp); awk -v r="$2" 'NR==2{print "blocked_reason: " r} {print}' "$1" > "$tmp" && mv "$tmp" "$1"
}

# usage-limit / rate-limit detection in agent output
# Only the tail: a provider error is the last thing a run prints, while an agent working on rate limiting or HTTP 429
# (tasks 1406/1407) mentions those words all through its transcript and was requeued as "limited" forever.
hit_limit() { [ -f "$1" ] && ! grep -qE "^(DONE|BLOCKED):" "$1" && tail -n 15 "$1" | grep -qiE "hit your (session|weekly|opus|sonnet|5-hour)[a-z ]*limit|usage limit|rate_limit|rate limit|\b429\b|quota exceeded|insufficient_quota|Too Many Requests"; }

# role prompt for pi workers, chosen from the task filename (prompts/roles/*.md)
task_role_file() {
  local n; n=$(basename "$1")
  case "$n" in
    *go-*|*-go-*) echo go-backend.md;;
    *web-*|*deploy-web*) echo frontend.md;;
    *ts-*|*codama*|*cli*|*mint-script*|*demo*|*wallets*) echo ts-client.md;;
    *readme*|*overview*|*submission*|*video*|*report*|*consistency*|*notice*|*fixtures*|*openapi*) echo docs.md;;
    *program*|*anchor*|*entitlement-crate*|*hardening*) echo anchor.md;;
    *) echo qa.md;;
  esac
}

_human_todo_nolock() { printf -- '- [ ] %s %s\n' "$(TZ=Asia/Almaty date '+%Y-%m-%d %H:%M')" "$*" >> "$ROOT/HUMAN_TODO.md"; _commit_queue_nolock "human note"; }
human_todo() { lock git; _human_todo_nolock "$@"; unlock git; }

# agents write reports/questions/<id>.md on their branch; after a merge the orchestrator folds them into HUMAN_TODO.md
_fold_questions_nolock() {
  local q
  for q in "$ROOT"/reports/questions/*.md; do
    [ -f "$q" ] || continue
    { printf -- '- [ ] %s (from %s)\n' "$(TZ=Asia/Almaty date '+%Y-%m-%d %H:%M')" "$(basename "$q" .md)"; sed 's/^/    /' "$q"; } >> "$ROOT/HUMAN_TODO.md"
    git -C "$ROOT" rm -q --cached "$q" >/dev/null 2>&1 || true; rm -f "$q"
  done
  _commit_queue_nolock "fold questions"
}
fold_questions() { lock git; _fold_questions_nolock; unlock git; }

# --- N concurrent slots (Opus reviews): acquire_slot <name> <n> -> prints the slot number; release_slot <name> <i> ---
acquire_slot() {
  local i d owner
  while :; do
    for ((i=1; i<=$2; i++)); do
      d="$TASKS/.lock-$1-$i"
      if mkdir "$d" 2>/dev/null; then echo $$ > "$d/pid"; echo "$i"; return 0; fi
      owner=$(cat "$d/pid" 2>/dev/null || true)
      [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null && rm -rf "$d"
    done
    sleep 5
  done
}
release_slot() { rm -rf "$TASKS/.lock-$1-$2"; }

# --- per-task Opus review gate (ops/review_task.sh; plan 15 "Harness") ---
review_gate() { [ "${REVIEW_GATE:-1}" = "1" ] && [[ " ${REVIEW_AGENTS:-glm flash} " == *" $1 "* ]]; }
review_rounds() { cat "$TASKS/.review-$1" 2>/dev/null || echo 0; }
bump_review_rounds() { echo $(( $(review_rounds "$1") + 1 )) > "$TASKS/.review-$1"; }
# append_review <task-file> <feedback.md> <round>: the next attempt reads it as part of the task
append_review() {
  { printf '\n## Review feedback (round %s, %s) — fix every blocking item first; your previous work is already committed on this branch\n\n' "$3" "$(TZ=Asia/Almaty date '+%F %H:%M')"; cat "$2" 2>/dev/null || echo "(reviewer output missing; see logs)"; } >> "$1"
}
# save_branch_patch <worktree> <log-prefix>: keep the agent's work for the resume path of run_task.sh
save_branch_patch() {
  local base; base=$(git -C "$1" merge-base HEAD main 2>/dev/null) || return 0
  git -C "$1" diff --binary "$base" HEAD -- . ':(exclude)tasks' > "$2.wip.patch" 2>/dev/null || true
  [ -s "$2.wip.patch" ] || rm -f "$2.wip.patch"
}
