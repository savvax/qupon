#!/usr/bin/env bash
# Daily human report (task 039 may improve this). Works without pi (plain-text fallback).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; source "$ROOT/ops/lib.sh"
[ -f "$ROOT/.env" ] && set -a && source "$ROOT/.env" && set +a
cd "$ROOT"
D=$(TZ=Asia/Almaty date +%F); OUT="reports/daily-$D.md"
RAW=$(mktemp)
{ echo "## Merged in the last 24h"; git log --since=24h --format='- %h %s' | grep -v 'chore(queue)' || echo "- none"
  echo; echo "## Queue"; for s in todo doing done failed; do printf -- '- %s: %s\n' "$s" "$(ls tasks/$s/*.md tasks/$s/*/*.md 2>/dev/null | wc -l | tr -d ' ')"; done
  echo; echo "## Blocked"; grep -l '^blocked_reason:' tasks/todo/*.md 2>/dev/null | xargs -I{} sh -c 'printf -- "- %s: %s\n" "$(basename {})" "$(grep ^blocked_reason: {} | cut -d: -f2-)"' || echo "- none"
  echo; echo "## Open human items"; grep '^- \[ \]' HUMAN_TODO.md | tail -n 15 || true
  echo; echo "## Worklogs"; for f in $(ls -t reports/worklog/*.md 2>/dev/null | head -n 10); do echo "### $(basename "$f")"; cat "$f"; done
  echo; echo "## Last nightly"; ls -t reports/nightly-*.md 2>/dev/null | head -1 | xargs -I{} tail -n 3 {} || true
} > "$RAW"
if command -v pi >/dev/null && [ -n "${ZAI_API_KEY:-}" ]; then
  pi -p --provider zai --model glm-5.3-flash --thinking low --no-session -nc -t read \
    "Summarize the following engineering status into a crisp daily report for the project owner (Russian is fine), max 200 words, bullets: what shipped, what is at risk vs the plan in docs/05-plan.md, what the human must do today. Keep task ids. Input:
$(cat "$RAW")" > "$OUT" 2>/dev/null || cp "$RAW" "$OUT"
else cp "$RAW" "$OUT"; fi
rm -f "$RAW"; log "[daily] wrote $OUT"
