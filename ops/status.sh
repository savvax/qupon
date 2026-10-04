#!/usr/bin/env bash
# Task board + recent activity.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
printf 'Qupon board — %s Asia/Almaty\n' "$(TZ=Asia/Almaty date '+%F %H:%M')"
for s in todo done failed; do printf '  %-7s %s\n' "$s" "$(ls tasks/$s/*.md 2>/dev/null | wc -l | tr -d ' ')"; done
echo "  doing:"; for d in tasks/doing/*/; do [ -d "$d" ] && for f in "$d"*.md; do [ -f "$f" ] && printf '    %-10s %s\n' "$(basename "$d")" "$(basename "$f")"; done; done
echo "  next claimable:"; for f in $(ls tasks/todo/*.md 2>/dev/null | sort | head -n 8); do printf '    %-8s %s\n' "$(awk '/^agent:/{print $2;exit}' "$f")" "$(basename "$f")"; done
echo "  blocked:"; grep -l '^blocked_reason:' tasks/todo/*.md 2>/dev/null | xargs -r -n1 basename | sed 's/^/    /'
echo "  last merges:"; git log --format='    %h %ad %s' --date=format:'%m-%d %H:%M' -n 10 | grep -v 'chore(queue)'
echo "  limit sleeps (last 5):"; grep -h 'limit' logs/orchestrator.log 2>/dev/null | tail -n 5 | sed 's/^/    /'
echo "  open human items: $(grep -c '^- \[ \]' HUMAN_TODO.md 2>/dev/null)"
