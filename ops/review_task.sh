#!/usr/bin/env bash
# Per-task Opus gate: a fresh-context Claude judges ONE task branch (in its worktree) against the task's acceptance
# criteria, the plan/spec it cites, AGENTS.md and — for web tasks — screenshots, before the orchestrator merges.
# usage: ops/review_task.sh <task-file> <worktree> <log-prefix>
# exit: 0 pass · 1 fail (feedback in <log-prefix>.review.md) · 2 reviewer unavailable (limit, crash, no verdict)
set -uo pipefail
TASK="$1"; WT="$2"; LOGP="$3"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib.sh
source "$ROOT/ops/lib.sh"
NAME=$(basename "$TASK" .md)
BASE=$(git -C "$WT" merge-base HEAD main)
SHOTS="$LOGS/shots/$NAME"; rm -rf "$SHOTS"; mkdir -p "$SHOTS"
SCHEMA='{"type":"object","properties":{"verdict":{"type":"string","enum":["pass","fail"]},"blocking":{"type":"array","items":{"type":"object","properties":{"file":{"type":"string"},"line":{"type":"integer"},"issue":{"type":"string"},"fix":{"type":"string"}},"required":["issue","fix"]}},"criteria":{"type":"array","items":{"type":"object","properties":{"criterion":{"type":"string"},"met":{"type":"boolean"},"evidence":{"type":"string"}},"required":["criterion","met"]}},"design_score":{"type":"integer"},"nits":{"type":"array","items":{"type":"string"}},"summary":{"type":"string"}},"required":["verdict","blocking","criteria","summary"]}'
PROMPT="$(cat "$ROOT/prompts/task-reviewer.md")

Task file: $TASK
Branch diff to judge: git diff $BASE..HEAD (your current directory is the task's worktree).
Screenshot folder: $SHOTS (use: bash $ROOT/ops/shots.sh $SHOTS <route>... ; then Read the PNGs).
Output the JSON verdict only."
TMO=$(command -v timeout || command -v gtimeout || true)
SLOT=$(acquire_slot review "${REVIEW_SLOTS:-2}")
log "[review] $NAME slot=$SLOT model=${TASK_REVIEW_MODEL:-opus}"
# shellcheck disable=SC2086
( cd "$WT" && export E2E_PORT=$((3300 + SLOT)) && ${TMO:+$TMO 40m} claude -p "$PROMPT" \
    --model "${TASK_REVIEW_MODEL:-opus}" --max-turns "${REVIEW_MAX_TURNS:-70}" \
    --permission-mode dontAsk --permission-prompts none \
    --allowedTools "Read" "Grep" "Glob" "Bash(git diff *)" "Bash(git log *)" "Bash(git show *)" "Bash(rg *)" "Bash(ls *)" \
      "Bash(cargo test *)" "Bash(go test *)" "Bash(make test-*)" "Bash(pnpm --filter * test*)" "Bash(pnpm --filter * typecheck*)" \
      "Bash(bash $ROOT/ops/shots.sh *)" \
    --json-schema "$SCHEMA" --output-format json ) > "$LOGP.review.json" 2> "$LOGP.review.err"
rc=$?
release_slot review "$SLOT"
# tests and screenshots may have written files: leave the worktree exactly at the reviewed commit
git -C "$WT" reset -q --hard HEAD; git -C "$WT" clean -qfd
if [ $rc -ne 0 ] || hit_limit "$LOGP.review.err"; then log "[review] $NAME reviewer unavailable (rc=$rc)"; exit 2; fi
V=$(jq -r '.structured_output.verdict // empty' "$LOGP.review.json" 2>/dev/null)
jq -r '"### Summary\n" + .structured_output.summary + "\n\n### Blocking\n" +
  ([.structured_output.blocking[] | "- " + ((.file // "") + (if .line then ":" + (.line|tostring) else "" end)) + " — " + .issue + "\n  **Fix:** " + .fix] | join("\n")) +
  "\n\n### Acceptance criteria not met\n" + ([.structured_output.criteria[] | select(.met == false) | "- " + .criterion + " — " + (.evidence // "")] | join("\n")) +
  (if .structured_output.design_score then "\n\nDesign score: " + (.structured_output.design_score|tostring) + "/10" else "" end)' \
  "$LOGP.review.json" > "$LOGP.review.md" 2>/dev/null
log "[review] $NAME verdict=${V:-none}"
case "$V" in pass) exit 0;; fail) exit 1;; *) exit 2;; esac
