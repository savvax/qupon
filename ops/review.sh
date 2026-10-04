#!/usr/bin/env bash
# Review pass: a fresh-context Claude subagent (Sonnet) judges the last N merged tasks against their acceptance criteria.
# usage: ops/review.sh [N=5]
set -uo pipefail
N="${1:-5}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; source "$ROOT/ops/lib.sh"
[ -f "$ROOT/.env" ] && set -a && source "$ROOT/.env" && set +a
cd "$ROOT"
BASE=$(git log --format=%H -n $((N+1)) --grep='task:' | tail -1)
[ -z "$BASE" ] && BASE=$(git rev-parse HEAD~"$N" 2>/dev/null || git rev-list --max-parents=0 HEAD)
TASKS_DONE=$(ls -t "$TASKS/done/"*.md 2>/dev/null | head -n "$N" | tr '\n' ' ')
[ -z "$TASKS_DONE" ] && { log "[review] nothing to review"; exit 0; }
OUT="$LOGS/review.$(date +%Y%m%d-%H%M%S).json"
PROMPT="$(cat "$ROOT/prompts/reviewer.md")

Base commit: $BASE. Task files to judge: $TASKS_DONE. Use \`git diff $BASE..HEAD --stat\` and read the relevant files. Output JSON only."
claude -p "$PROMPT" --model "${CLAUDE_REVIEW_MODEL:-sonnet}" --max-turns 40 --permission-mode dontAsk --permission-prompts none \
  --allowedTools "Read" "Grep" "Glob" "Bash(git diff *)" "Bash(git log *)" "Bash(git show *)" "Bash(cargo test *)" "Bash(go test *)" \
  --json-schema '{"type":"object","properties":{"verdict":{"type":"string","enum":["pass","fail"]},"gaps":{"type":"array","items":{"type":"object","properties":{"file":{"type":"string"},"line":{"type":"integer"},"severity":{"type":"string"},"issue":{"type":"string"},"fix":{"type":"string"}},"required":["file","issue","fix"]}},"notes":{"type":"string"}},"required":["verdict","gaps"]}' \
  --output-format json > "$OUT" 2>"$OUT.err" || { log "[review] claude failed; see $OUT.err"; exit 0; }
VERDICT=$(jq -r '.structured_output.verdict // .result // "unknown"' "$OUT" 2>/dev/null)
log "[review] verdict=$VERDICT ($OUT)"
if [ "$VERDICT" = "fail" ]; then
  STAMP=$(date +%H%M%S)
  F="$TASKS/todo/9$(date +%d)$STAMP-review-fixes.md"
  { echo "---"; echo "id: 9$(date +%d)$STAMP"; echo "title: Fix review findings ($(date +%F))"; echo "agent: glm"; echo "tier: T1"; echo "depends_on: []"; echo "verify: make verify"; echo "timeout_min: 45"; echo "---";
    echo "## Goal"; echo "Address the reviewer findings below (high/medium first). Each fix needs a test or a clear reason why not."; echo; echo "## Findings (JSON)"; echo '```json'; jq '.structured_output.gaps' "$OUT"; echo '```'; echo; echo "## Acceptance criteria"; echo "- [ ] every high/medium finding fixed or rebutted in reports/worklog/<id>.md"; echo "- [ ] make verify green"; echo; echo "## Finish"; echo "Print DONE:<id> or BLOCKED:<id> <reason>."; } > "$F"
  commit_queue "review fixes task"
  log "[review] created $F"
fi
