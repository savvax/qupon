---
id: 91584
title: judge-facing failure polish — /bonds SSR timeout, friendly sandbox failure, drop the dead proof fallback RPC
agent: glm
tier: T1
depends_on: [1540]
verify: make verify
timeout_min: 90
---
## Goal
Three small web fixes from the new-server audits (`reports/audit/new-server-demo.md` A91580-2/3/4,
`reports/audit/new-server-sweep.md` A91582-2). The RPC outage itself is fixed server-side (commit 5805fce3); these make
the next transient failure look clean to a judge.

## Do
1. **/bonds SSR timeout (A91580-3):** the board's server-side fetch to the registrar has no timeout — one hung chain read
   stalled the page 30 s before the browser gave up. Give that fetch `signal: AbortSignal.timeout(8000)` at the shared
   API fetch helper the board uses (grep `apps/web/src` for the board's data call; fix it once in the helper if all
   server-side registrar reads go through it). On abort, render the existing localized "registrar service is unavailable"
   degraded state (already present — do not add a new one).
2. **Sandbox failure card (A91580-2):** `apps/web/src/app/(public)/sandbox/new/SandboxStart.tsx` shows `failure.message`
   verbatim (e.g. `executor_failed: cli series:create refused: qupon: HTTP error (429): Too Many Requests`). Show a
   localized sentence instead ("Devnet is busy right now — try again in a minute." in en, plus ru/kk in
   `apps/web/messages/{en,ru,kk}.json`), keep the existing Retry button, and keep the raw message only inside a collapsed
   `<details>` "Technical details". No other UI change.
3. **Proof fallback RPC (A91582-2 / A91580-4):** `apps/web/src/lib/proof/endpoints.ts` falls back to
   `https://solana-devnet-rpc.publicnode.com/`, which 404s every request without CORS headers (red console errors on
   every proof load). Delete that endpoint from the chain (keep `api.devnet.solana.com`); adjust any test that pins the
   list. Do not add a new third-party RPC.
4. Tests: one unit test for the sandbox failure mapping (raw message → friendly key, raw kept for details) and keep every
   existing test (unit + mock e2e) green.

## Constraints
Post-freeze polish: smallest safe diff, web only (`apps/web`); no registrar/program changes; do not deploy; never print
RPC URLs or keys; never name other hackathon participants; English in code, en/ru/kk for the new message.

## Finish
Commit `fix(web): bonds SSR timeout, friendly sandbox failure, drop dead proof RPC fallback` (`task: 91584`), write
`reports/worklog/91584.md`, print `DONE:91584` or `BLOCKED:91584 <reason>`.
