# Full demo walkthrough on the new production server (task 91580)

Date: 2026-10-12 (06:45–10:15 Asia/Almaty, resumed after an interrupted first attempt — phases A/C/explorer completed then; board/dossiers/sandbox verified as failing through the whole outage window, recovery re-run scripts committed). New primary: `https://qupon.185-216-25-91.sslip.io` + API `https://api.185-216-25-91.sslip.io`, devnet.
Method: same as `reports/audit/live-sweep.md` / `judge-score.md` — Playwright (Chromium headless), `reports/audit/tools/new-server-{1,1b,2,3,4,5,6}-*.cjs`, screenshots in `reports/audit/shots/new-server/` (1280×800/900 JPEG ≤ 300 KB). Read-only except: sanctioned "Try it in 3 minutes" loads (create refused server-side — no sandbox ever issued, budget intact), issuer wizard stopped at Review (no submit), no votes cast (no open meeting on a non-showcase series). Machine results: `/tmp/ns-results-{a,b,c}.json` + `/tmp/ns-poll.log`.

**Context:** the keyed devnet RPC (Helius) shared by both prod APIs has been over quota since ≈06:45 (first observed in the interrupted run; task 91582 documented it at 07:37 as A91582-1 [P0]). During the whole walkthrough window `GET /api…/series` → `502 {"code":"http_502","error":"chain read failed"}` (old server's 502 names the cause: `getProgramAccounts() on https://devnet.helius-rpc.com/ status code: 429`). Everything server-side chain-read-dependent was verified as failing identically on the old server; everything browser-side was verified working. Timings below are from the moments each page was loadable.

## Step → result

| # | Step | Result | Time | Evidence |
|---|------|--------|------|----------|
| 1 | Landing `/` en/ru/kk | ✓ | 5.6–5.8 s | HTTP 200, hero + program id + CTA; 0 console errors; `01-landing-{en,ru,kk}.jpg` |
| 2 | `/learn` en/ru/kk | ✓ | 3.6–3.8 s | HTTP 200, localized; `01-learn-{en,ru,kk}.jpg` |
| 3 | `/bonds` board incl. Closed redemption series | ✗ (A1) | 500 in 2.3 s (30 s hang at 06:50) | HTTP 500 → localized degraded state “registrar service is unavailable”; API `/series` 502 chain read failed; old server identical; `02-bonds-all-en.jpg`, `07-bonds-degraded.jpg` |
| 4 | Showcase dossiers ×4 (coupon paid 500/1,250/3,250 + explorer links; redemption closed w/ burn; meeting votes; MCAL) | ✗ (A1) | 500 in ≤3.6 s each | all mints (`5tww8A3M…`, `GKRsSH9v…`, `E7RgTKWT…`, `9zunUAFs…`) → HTTP 500 with the same degraded state; chain data exists (see #6 proof certificates re-verifying it from the browser); `03-dossier-*.jpg`, `07-dossier-closed-degraded.jpg` |
| 5 | `/holder/<owner>` | ✓* | 2.1–6.6 s | HTTP 200; renders (empty/error-tolerant state during outage); `06-holder.jpg` |
| 6 | `/proof` + both listed certificates → "All checks pass" | ✓ | picker 5.9 s; **7MBQ7y 9/9 ✓ at +50.5 s; E4EHdA 6/6 ✓ at +50.4 s** (+61 s re-verified during the outage) | entitlement math, snapshot fingerprint, escrow money in/out re-verified in-browser; `04-proof-picker.jpg`, `05-proof-*-final.jpg`, `05-proof-E4EHdA-outage.jpg` |
| 7 | "Try it in 3 minutes" → sandbox → coupon 1 paid | ✗ (A1) | create dies at ~+90–180 s | `/sandbox/new` counts up silently, then the failure card: “The sandbox did not start — executor_failed: cli series:create refused: qupon: HTTP error (429): Too Many Requests” (A2); no sandbox issued, retry offered; `11-sandbox-waiting-{60s,180s}.jpg` |
| 8 | Sandbox scenarios (DvP w/ accrued, non-KYC transfer, skip funding/default+cure) | — not reachable | — | requires #7; not retried during the outage (the create was refused server-side, so no sandbox consumed) |
| 9 | Sandbox maturity/close | — not reachable | — | requires #7 |
| 10 | Back office — issuer: dashboard, series list, wizard→Review (no submit), organization, team, documents | ✓ | 5.3 s/dashboard | one-click demo sign-in works; wizard reaches Review, nothing submitted; `2*-issuer*.jpg`, `22-wizard-{terms,review}.jpg` |
| 11 | Back office — registrar: dashboard, actions console, KYC queue, trades, reports | ✓* | 5.3 s each | pages 200 and render, but dashboard shows the "registrar service is unavailable" banner while chain reads fail (A1, expected); actions/KYC/trades/reports lists render; `23-registrar-*.jpg` |
| 12 | Back office — investor: portfolio, meetings | ✓ | 5.3 s each | no open meeting on a non-showcase series → no vote cast (rule); `24-investor-*.jpg` |
| 13 | Back office — admin | ✓ (gated, by design) | — | no admin demo role on `/login` (issuer/registrar/investor only — same as old server); `/admin` → `/forbidden?role=investor_demo`; `25-admin-gated.jpg` |
| 14 | Explorer spot-check of 3 tx links | ✓ | ~6 s each | 3 signatures from the passing proof certificate open on explorer.solana.com with `?cluster=devnet` and render the sig; `30-explorer-tx{1,2,3}.jpg` |
| 15 | Console errors / failed requests / raw keys / stuck spinners | ✗ minor (A2) | — | 0 untranslated keys; proof pages log publicnode CORS + `429` console errors (dead fallback RPC, A91582-2); `/sandbox/new` keeps an elapsed-seconds counter with no ETA (A3) |

## Findings

### A91580-1 [P0] The judge demo path is down for as long as the shared keyed RPC stays over quota: board, all 4 dossiers and the sandbox fail end to end
**Where:** new server `/bonds`, `/bonds/<mint>` (all 4 showcase mints), `/sandbox/new` (POST `/api/bo/demo/sandbox`); identical on the old server.
**Evidence:** steps 3, 4, 7 above. `curl /api…/series` → `502 chain read failed` continuously 06:50–10:15 (60× minute-by-minute poll + spot checks until 10:15, `/tmp/ns-poll.log`); the old server's 502 body names the root cause (`getProgramAccounts() … helius … 429`). Site `/bonds` → HTTP 500 (30 s SSR hang once at 06:50, fast 500 thereafter) with the localized "registrar service is unavailable" state; `/sandbox/new` create is refused by the executor with `cli series:create refused: qupon: HTTP error (429)` (see A2 for the judge-facing form). Browser-side devnet (api.devnet + publicnode) answers — proof certificates re-verify the very showcase data the API cannot read, and the site header's devnet slot widget keeps updating — so this is purely the servers' keyed RPC quota. Same root as A91582-1, confirmed end-to-end along the demo path with timings; the sweep's "owner action" (raise/replace Helius quota or repoint `RPC_URL`) is still outstanding. `services/registrar/internal/chain/client.go` — the 3 s `gpaCache` has no stale-serve, so one 429 window blanks every chain-derived page.
**Fix:** owner restores/rotates the devnet RPC quota before the demo (question filed: `reports/questions/91580-rpc-quota.md`); code-side, serve stale gpaCache entries on RPC failure (TTL×N grace) so showcase pages survive short 429 windows.

### A91580-2 [P2] Sandbox create failure surfaces a raw executor error after ~2–3 min of a silent counter
**Where:** `apps/web/src/app/(public)/sandbox/new/SandboxStart.tsx` (failure card renders `failure.message` verbatim).
**Evidence:** with the create dead, the judge watches the step list and elapsed counter for ~90–180 s (`11-sandbox-waiting-60s.jpg`), then gets “The sandbox did not start — **The registrar answered: executor_failed: cli series:create refused: qupon: HTTP error (429): Too Many Requests**” (`11-sandbox-waiting-180s.jpg`) — an internal executor/CLI trace in English on all locales, no ETA on the happy path either (happy create is ~40 s on the old server, `judge-score.md`). Retry does work via the idempotent `requestId`.
**Fix:** map executor errors to a friendly localized “devnet is busy right now — try again in a minute” (keep the raw string in a `<details>`); add an ETA line ("usually ~40 s") so the wait reads as progress.

### A91580-3 [P2] `/bonds` SSR has no API timeout: one hung chain read stalls the whole page 30 s before the 500
**Where:** `apps/web/src/app/(public)/bonds/page.tsx` (server fetch to the registrar API).
**Evidence:** 06:50 `page.goto /bonds` → `net::ERR_TIMED_OUT` at 30 s; the same request ~2 h later fails in 2.3 s with HTTP 500 (upstream now failing fast). A judge in the hung window sees a browser-level timeout, not even the localized degraded state.
**Fix:** wrap the SSR fetch in a 5–8 s `AbortSignal.timeout` and render the existing degraded state (which is already localized and clean) on any failure.

### A91580-4 [P2] Proof pages log CORS + 429 console errors from the dead `publicnode` fallback during every walk
**Where:** `apps/web/src/lib/proof/endpoints.ts` fallback chain (already A91582-2; confirmed from the demo-path perspective).
**Evidence:** on all four proof loads (both mints, incl. the outage re-check): `Access to fetch at 'https://solana-devnet-rpc.publicnode.com/' … blocked by CORS policy` + `429` on api.devnet while history walks; certificates still reach "All checks pass" at +50–61 s. Judges with the console open see red noise on the flagship verification page.
**Fix:** as A91582-2 — replace the fallback endpoint (or drop it and cache the walked history per mint).

### A91580-5 [P2] No open meeting to vote on — the meeting demo step has no live target on the new server
**Where:** investor `/investor/meetings`; showcase MCAL series meeting has voted/closed.
**Evidence:** meetings page renders (HTTP 200) but lists no open meeting; the showcase dossier (which would show the voted meeting) is unreachable during the outage (A1). Per the task rule no vote was cast anywhere. The video script's step 7 (65/25/10 votes) is currently only demonstrable via a sandbox meeting.
**Fix:** the showcase autopilot could leave the most recent meeting open (not auto-closed) so the meetings demo step has a permanent live target, or the demo video should use the sandbox meeting.

## Verified clean (no finding)
- Landing/learn fully localized (en/ru/kk), 0 raw i18n keys, 0 console errors off the proof pages; no stuck spinners outside A2/A3 (every long wait either completes or errors).
- `/proof` is outage-proof: both certificates re-verify entirely in the browser (50–61 s to "All checks pass"), explorer links all carry `?cluster=devnet`; 3/3 spot-checked signatures render on explorer.solana.com.
- One-click demo sign-in (issuer/registrar/investor) works on the new server; all walked cabinet pages answer 200 in ~5.3 s with no untranslated keys; wizard reaches Review without submitting; admin correctly gated (no demo role — same as old server).
- Holder lookup renders a valid page for a showcase owner address even while chain reads are down (graceful, not a crash).

## Differences vs the old server (`qupon.85-192-29-7.sslip.io`)
- Every failure above reproduces identically on the old server (same API code, same keyed RPC) — nothing new-server-specific found in behaviour; the new server fails *faster and cleaner* (generic 502 body, no RPC host leak — A91582 noted the old server still leaks its RPC host in 502s).
- Old server extras not present on the new one: >45 s web-container stalls (A91567-1) never observed in ~90 loads here.
- Not verifiable until A1 clears on either server: board default filter (A91567-3), ₸ spacing (A91567-7), registrar notice locale (A91567-4) — same list as 91582.

## Summary (5 lines)
1. P0 (A1, shared with A91582-1): the whole judge path that needs server-side chain reads — bonds board, all 4 showcase dossiers, and the "Try it in 3 minutes" sandbox — is down on the new server (and identically on the old one) for the entire 06:45–10:15 window: the keyed Helius devnet RPC is over quota and the 3 s gpa cache has no stale-serve. Owner action needed before the demo.
2. What a judge can still do today: landing/learn in 3 locales, /holder, one-click back office (issuer wizard to Review, registrar lists, investor portfolio/meetings, admin gated) — all ~200s in ~5 s, localized, no console errors.
3. The flagship /proof page survives the outage entirely: both showcase certificates re-verify in the browser at +50–61 s with 9/9 and 6/6 checks, and 3/3 explorer tx spot-checks pass — the on-chain showcase data itself is intact.
4. Sandbox UX in failure mode: ~2–3 min of silent elapsed counter, then a raw executor trace ("executor_failed: cli series:create refused: … 429") shown to the judge (A2); /bonds SSR can also hang 30 s before its localized degraded state (A3).
5. After RPC is restored, re-run `tools/new-server-{1b,2}-*.cjs` (board, dossiers, one sandbox through coupon→scenarios→maturity, ru/kk dossier) — scripts are committed and take ~15 min total.
