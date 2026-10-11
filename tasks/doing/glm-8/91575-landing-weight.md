---
id: 91575
title: landing first paint fast: trim the 676 KB HTML
agent: glm
tier: T1
depends_on: [1540]
verify: make verify
timeout_min: 120
---
## Goal
Finding A91571-4 (`reports/audit/judge-score.md`): cold `/` = 2.3 s TTFB, 676 KB HTML; `/learn` 643 KB, `/proof` 540 KB.

## Do
- Find what inflates the HTML (likely the RSC payload: all message namespaces / all three locales passed to
  `NextIntlClientProvider`, large inline data, inlined SVGs) — measure with `curl -s <url> | wc -c` locally against
  `pnpm build && pnpm start` before and after.
- Pass only the namespaces each client tree needs; make static parts of the landing statically rendered/cached
  (`revalidate`) while the live devnet header stays live. Target: landing HTML < 250 KB, TTFB < 500 ms on a warm local
  server. Do not change visuals (compare screenshots 1440/390 en/ru/kk before/after; `sweep.spec.ts` green).

## Constraints
Pre-submission (code freeze 2026-10-12 12:00 Almaty). Smallest safe change; never weaken a test; do not deploy; never
print or commit secrets; never name other hackathon participants or compare with them anywhere.

## Finish
Commit with `task: 91575`, write `reports/worklog/91575.md` (3–6 lines), print `DONE:91575` or `BLOCKED:91575 <reason>`.
