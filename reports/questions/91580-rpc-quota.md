# 91580 — devnet RPC quota blocks the judge demo path on BOTH prod servers

**Decision needed by:** demo recording / submission (target 2026-10-12 20:00).

Since ≈06:45 Asia/Almaty the keyed devnet RPC (Helius, shared `RPC_URL` by both prod APIs) is over
quota: `getProgramAccounts()` answers 429 to the registrar, so `GET /api…/series` → 502 and the site
renders `/bonds`, all 4 showcase dossiers and the "Try it in 3 minutes" sandbox as failures —
identically on `qupon.185-216-25-91.sslip.io` and `qupon.85-192-29-7.sslip.io`. Browser-side devnet
is healthy: /proof re-verifies the same showcase data from the visitor's browser in ~50–61 s.
Same root cause already filed by task 91582 as A91582-1; this task confirmed it end-to-end along the
demo path (task 91580, `reports/audit/new-server-demo.md` A91580-1).

**Options**
1. Raise/rotate the Helius devnet key (or another provider) and redeploy both servers — restores the
   full judge path. Recommended.
2. Leave as is: judges can still see landing/learn/back-office//proof, but the sandbox and every bond
   page fail.

**Default taken:** none possible from my side (no ssh/deploys per task rules) — reported as P0 in the
audit; committed re-run scripts `reports/audit/tools/new-server-{1b,2}-*.cjs` verify recovery in ~15 min.
