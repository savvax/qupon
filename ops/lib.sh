#!/usr/bin/env bash
# Shared helpers for the Qupon agent orchestration. Source this file; do not run it.
# Portable bash 4+/zsh-free; works on Linux and macOS (no flock dependency).

ROOT="${ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
TASKS="$ROOT/tasks"
LOGS="$ROOT/logs"
mkdir -p "$LOGS" "$TASKS/todo" "$TASKS/doing" "$TASKS/done" "$TASKS/failed"

log() { printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" | tee -a "$LOGS/orchestrator.log" >&2; }

# --- tiny mkdir-based mutex (portable) ---
lock() {   # lock <name>
  local d="$TASKS/.lock-$1" i=0
  until mkdir "$d" 2>/dev/null; do sleep 0.2; i=$((i+1)); [ $i -gt 300 ] && { log "lock $1 stuck; breaking"; rm -rf "$d"; }; done
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

# Z.ai peak hours for GLM-5.3: Mon–Fri 11:00–15:00 Asia/Almaty (= 14:00–18:00 SGT)
is_peak() {
  [ "${FORCE_PEAK:-0}" = "1" ] && return 1
  local dow hour
  dow=$(TZ=Asia/Almaty date +%u); hour=$(TZ=Asia/Almaty date +%H)
  [ "$dow" -le 5 ] && [ "$hour" -ge 11 ] && [ "$hour" -lt 15 ]
}

# claim <agent> <worker> -> prints claimed file path (now under doing/<worker>/) or nothing
claim() {
  local agent="$1" worker="$2" f id
  lock queue
  for f in $(ls "$TASKS/todo/"*.md 2>/dev/null | sort); do
    [ "$(task_agent "$f")" = "$agent" ] || continue
    grep -q '^blocked_reason:' "$f" && continue
    [ "$(task_tier "$f")" = "T2" ] && [ "${ALLOW_T2:-0}" != "1" ] && continue
    deps_done "$f" || continue
    if [ "$agent" = "glm" ] && is_peak && [ "$(task_tier "$f")" != "T0" ]; then continue; fi
    mkdir -p "$TASKS/doing/$worker"
    mv "$f" "$TASKS/doing/$worker/"
    unlock queue
    echo "$TASKS/doing/$worker/$(basename "$f")"
    return 0
  done
  unlock queue
  return 1
}

requeue() { lock queue; mv "$1" "$TASKS/todo/"; unlock queue; commit_queue "requeue $(basename "$1")"; }
finish()  { lock queue; mv "$1" "$TASKS/done/"; unlock queue; commit_queue "done $(basename "$1")"; }
fail()    { lock queue; mv "$1" "$TASKS/failed/"; unlock queue; commit_queue "failed $(basename "$1")"; }

retries() { local id="$1"; cat "$TASKS/.retries-$id" 2>/dev/null || echo 0; }
bump_retries() { local id="$1" n; n=$(retries "$id"); echo $((n+1)) > "$TASKS/.retries-$id"; }

set_agent() {  # set_agent <file> <agent>
  local tmp; tmp=$(mktemp)
  awk -v a="$2" 'BEGIN{done=0} /^agent:/&&!done{print "agent: " a; done=1; next} {print}' "$1" > "$tmp" && mv "$tmp" "$1"
}
add_blocked() { # add_blocked <file> <reason>
  grep -q '^blocked_reason:' "$1" || sed -i.bak "2i blocked_reason: $2" "$1" 2>/dev/null || { local tmp; tmp=$(mktemp); awk -v r="$2" 'NR==2{print "blocked_reason: " r} {print}' "$1" > "$tmp" && mv "$tmp" "$1"; }
  rm -f "$1.bak"
}

# usage-limit / rate-limit detection in agent output
hit_limit() { grep -qiE "hit your (session|weekly|opus|sonnet|5-hour)[a-z ]*limit|usage limit|rate_limit|rate limit|\b429\b|quota exceeded|insufficient_quota|Too Many Requests" "$1"; }

# role prompt for pi workers, chosen from the task filename (prompts/roles/*.md)
task_role_file() {
  local n; n=$(basename "$1")
  case "$n" in
    *go-*|*-go-*) echo go-backend.md;;
    *web-*|*deploy-web*) echo frontend.md;;
    *ts-*|*codama*|*cli*|*mint-script*|*demo*|*wallets*) echo ts-client.md;;
    *readme*|*overview*|*submission*|*video*|*report*|*consistency*|*notice*) echo docs.md;;
    *program*|*anchor*|*entitlement-crate*|*hardening*) echo anchor.md;;
    *) echo qa.md;;
  esac
}

human_todo() { printf -- '- [ ] %s %s\n' "$(TZ=Asia/Almaty date '+%Y-%m-%d %H:%M')" "$*" >> "$ROOT/HUMAN_TODO.md"; commit_queue "human note"; }

# The orchestrator owns the queue state on main and commits it so that main's working tree is always clean
# before a fast-forward merge. Agents never edit tasks/done or HUMAN_TODO.md; they write per-task files instead
# (reports/worklog/<id>.md, reports/questions/<id>.md) so that parallel branches never conflict.
commit_queue() {
  ( cd "$ROOT" && git add -A -- tasks HUMAN_TODO.md 2>/dev/null; git add -A -- reports 2>/dev/null; \
    git diff --cached --quiet || git commit -qm "chore(queue): ${1:-state} [skip ci]" >/dev/null 2>&1 ) || true
}
fold_questions() {   # move agents' question files into HUMAN_TODO.md
  local q
  for q in "$ROOT"/reports/questions/*.md; do
    [ -f "$q" ] || continue
    { printf -- '- [ ] %s (from %s)\n' "$(TZ=Asia/Almaty date '+%Y-%m-%d %H:%M')" "$(basename "$q" .md)"; sed 's/^/    /' "$q"; } >> "$ROOT/HUMAN_TODO.md"
    git -C "$ROOT" rm -q --cached "$q" >/dev/null 2>&1 || true; rm -f "$q"
  done
}
