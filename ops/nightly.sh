#!/usr/bin/env bash
# Nightly: run the devnet demo, write a report, then the daily human report. Schedule with cron at 03:00 Asia/Almaty:
#   0 22 * * * cd /path/to/qupon && bash ops/nightly.sh   (22:00 UTC = 03:00 Almaty)
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; source "$ROOT/ops/lib.sh"
[ -f "$ROOT/.env" ] && set -a && source "$ROOT/.env" && set +a
cd "$ROOT"
D=$(TZ=Asia/Almaty date +%F)
{ echo "# Nightly $D"; echo; echo '```'; if make demo 2>&1; then echo "DEMO OK"; else echo "DEMO FAILED"; fi; echo '```'; } > "reports/nightly-$D.md"
bash "$ROOT/ops/daily-report.sh" || true
commit_queue "nightly $D"
