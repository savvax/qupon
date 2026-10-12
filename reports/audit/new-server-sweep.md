# New primary server sweep + security probe — task 91582

Date: 2026-10-12 (pre-submission). New primary: `https://qupon.185-216-25-91.sslip.io` + API `https://api.185-216-25-91.sslip.io`, devnet.
Method: identical to task 91567 (`reports/audit/live-sweep.md`) + production part of task 91570 (`reports/audit/security-hygiene.md`). Playwright (Chromium headless), `reports/audit/tools/new-server-sweep{,2}.cjs` — **264 page-loads** (every public route + every demo-reachable cabinet route × en/ru/kk × 1440/390, all 4 showcase dossiers swept by mint from `config/featured-series.txt` because the board 500s), GET-only except the sanctioned one-click demo sign-in (issuer/registrar/investor; no admin offered). **No sandbox created** (task 91580 owns that; `/sandbox/*` excluded). Timeouts retried 3× per task rules — **0 retries needed, 0 goto timeouts** (old server's A91567-1 stall not reproduced). Machine reports: `/tmp/new-server-sweep{,2}.json`.

Coverage: `/`, `/bonds` (+ all 4 showcase dossiers incl. the closed Astana-Metro), `/learn`, `/proof` + both listed proof mints, `/holder` (bare, 404 by design), `/login`, `/signup`, `/invite` (+bad token), `/reset/<bad-token>`, `/forbidden`, `/does-not-exist`, legacy redirects (`/console`, `/portal`), issuer (6 routes), registrar (8 lists), investor (6, signed in and out), `/admin` logged out (redirects to login). Demo roles offered: **issuer, registrar, investor**.

---

### A91582-1 [P0] Both prod APIs' chain reads are down (keyed devnet RPC over quota) — bonds board, all 4 dossiers, schedule, holders 500/502 on the NEW primary server

**Where:** API `GET /series`, `/series/{mint}`, `/actions/{pda}`, `/schedule`, `/holders/{owner}`; site `/bonds` and `/bonds/<mint>` (all 4 showcase mints, all locales/widths).
**Evidence:** `curl …/api…/series` → `502 {"code":"http_502","error":"chain read failed"}` (4/4 tries over ~10 min, not the VPN — `/healthz`, `/network`, `/activity`, `/assets` answer 200 in the same loop). Site `/bonds` → HTTP 500 on navigation, then the localized degraded state “The registrar service is unavailable / Сервис регистратора недоступен” (`shots/new-server-sweep/bonds-en-1440.jpg`, `bonds-ru-390.jpg`); all 24 dossier loads → 500 (`bonds-GKRsSH9vkqAdKcVsHY8aAhUGUt5iAGPSarRTWBFrR93k-en-1440.jpg`). Registrar `/registrar/actions` shows **“No corporate actions here”** — the core corporate-actions registry renders empty; no action detail reachable. The OLD server fails the same way right now and names the cause: `502 … "rpc failed after 3 attempts: getProgramAccounts() on https://devnet.helius-rpc.com → status code: 429"` — both deployments take the keyed `RPC_URL` from `.env` (`ops/deploy-vps.sh:15`, `.env.example:2`). Browser-side devnet reads work fine throughout (proof certificates verify, slot widget live) → server-side RPC quota, not devnet itself.
**Impact:** the entire public bond showcase and the actions registry — the scored demo surface — are down on the primary submission server.
**Fix:** owner action before submitting — raise/replace the Helius devnet quota or point `RPC_URL` at another provider and redeploy; then re-run this sweep's phase 1. Also check why `ops/watchdog.sh` (probes `getHealth` on `RPC_URL`) did not page: either not running on the new box or Helius still answers `getHealth` while `getProgramAccounts` is quota-limited — make the watchdog do one `getProgramAccounts`-class read.

### A91582-2 [P1] The proof page's fallback RPC is dead (`publicnode` 404s everything) → CORS console errors and stalled sub-checks whenever devnet rate-limits

**Where:** `apps/web/src/lib/proof/endpoints.ts:16` (fallback chain `api.devnet.solana.com → solana-devnet-rpc.publicnode.com`), live on `/proof/<mint>` (both mints, all locales).
**Evidence:** console on every proof load under load: `Access to fetch at 'https://solana-devnet-rpc.publicnode.com/' … No 'Access-Control-Allow-Origin' header` (the 404 response carries no CORS headers). Direct probes: POST ×3 and GET → `404` (cloudflare), stable across retries. Session-wide 2931 × `429 POST api.devnet.solana.com` while proof pages walk history; when the primary 429s, the "fallback" also fails, so the A91571-5 redundancy does not exist in practice. Proof timing to “All checks pass”: **40.3 s** (28-tx mint) and **52.4 s** (46-tx mint) — same ballpark as the old server (A91567-2: 45–90 s), still slow but both mints do reach `16/16 · All checks pass`.
**Fix:** replace the second endpoint with a keyless devnet RPC that still answers (verify with a one-line startup probe), or drop the fallback and cache the walked history per mint (A91567-2 fix).

### A91582-3 [P2] `permissions-policy` header regressed: missing on both new hosts (was present on the old server)

**Where:** Caddy in front of `qupon…` and `api…`.
**Evidence:** `curl -sD -` on both hosts → no `permissions-policy` (old server sent `camera=(), microphone=(), geolocation=()` per A91570-4). Everything else unchanged from A91570-4: HSTS still `max-age=31536000` without `includeSubDomains`, no CSP, `via: 1.1 Caddy` disclosed; `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: strict-origin-when-cross-origin` present on both.
**Fix:** carry the old Caddyfile's header block over and add `includeSubDomains` + a minimal CSP while at it.

### A91582-4 [P2] `github.com/savvax/qupon` links still 404 — repo still private

**Where:** footer “Source code”/“Technical overview” + landing links, sitewide (36+ page/locale combos link it).
**Evidence:** HEAD → 404 for the repo and both `blob/main/…` doc links. Unchanged from A91567-6 / A91570-1; owner action in progress.
**Fix:** flip visibility / grant Colosseum access before submitting.

### A91582-5 [P2] One-off hydration mismatch on the investor placement page (kk, 390 px)

**Where:** `/investor/placement` kk/390.
**Evidence:** `pageerror: Minified React error #418` (server/client HTML mismatch) on exactly 1 of 12 loads of that route (kk/1440 and all other locales clean; the 5 other investor routes clean across 36 signed-in loads). `shots/new-server-sweep/investor-placement-kk-390.jpg`.
**Fix:** look for a locale- or time-dependent value rendered server-side but recomputed client-side on that page; low priority if not reproducible after A1 is fixed (chain-read failures feed the page).

---

## Verified clean (no finding)

- **AuthZ (91570 method):** all 27 guarded GET routes → 401 without a session: `/me{,/wallets,/kyc,/notifications,/notifications/count,/documents,/onboarding,/reports/statement,/reports/tax}`, `/org{,/members}`, `/registrar/{audit,kyc,kyc/1,reports/holders/<mint>}`, `/issuer/reports/payouts/<pda>`, `/admin/{users,organizations,series,audit,assets,custodian,system,network/readiness}`, **`/approvals`** (A91570-5 **fixed live**: was 200-unauthenticated on the old server, now 401).
- **Error bodies:** A91570-3 **fixed** on the new server — 502s say generic `chain read failed`, 401 `sign in required`, 404 `404 page not found` / `no such document`; no Anchor discriminators, no RPC hosts, no stack traces. (The old server still leaks its RPC host + method in the same 502 — noted for the comparison, not a new-server finding.)
- **Rendering:** 0 horizontal overflow at 390 px across all 264 loads; 0 broken images; 0 raw i18n keys (`api.devnet.solana` on proof pages is the RPC host name, not a key); 0 NaN/undefined/Invalid Date; 0 untranslated enums — **A91567-5 fixed** (activity ru/kk fully localized; the only `snake_case` hit anywhere is the `qupon_bonds` program name on the landing page).
- **Locales:** every public page localizes title/hero/nav in ru/kk; the bonds degraded state localizes too; investor cabinet ru/kk clean signed in and out.
- **Explorer links:** 5190 collected sitewide — **100 % carry `?cluster=devnet`** (0 missing). External links beyond explorer/GitHub: none.
- **Demo sign-in:** issuer/registrar/investor all work; investor cabinet renders identically signed in; no admin role offered.
- **CORS:** read-only by design — any origin echoed for GET/HEAD, `access-control-allow-methods: GET, HEAD`, no `Allow-Credentials`, preflight for POST grants no POST method. Unchanged from the old server.
- **TLS:** both hosts serve valid certs, CN matches host, issued 2026-10-11, expire 2027-01-09; HTTP/2 + h3 advertised.
- **No web-container stalls:** 0 goto timeouts, 0 retries across 264 loads (A91567-1 not reproduced — but see A1: the failure mode moved from stalls to hard chain-read errors).
- Legacy redirects work (`/console`→`/login`, `/portal`→`/investor`); `/does-not-exist` serves the localized 404; `/invite` and `/holder` bare paths 404 by design.

## Differences vs the old server's reports (91567 / 91570)

- **Fixed:** A91570-3 (502 internals → generic), A91570-5 (`/approvals` now 401), A91567-5 (activity enums localized). A91567-1 (>45 s stalls) not reproduced.
- **New/regressed:** A91582-1 (chain reads down on both servers — new since 91567 ran yesterday; the public showcase was healthy then), A91582-2 (dead publicnode fallback, visible as CORS errors), A91582-3 (`permissions-policy` dropped), A91582-5 (one-off hydration mismatch).
- **Unverifiable until A1 is fixed:** board default filter hiding the closed redemption series (A91567-3), ₸ spacing consistency (A91567-7), registrar action-detail notice locale (A91567-4) — the pages 500 or render empty; re-check after the RPC quota is restored.

## Summary (5 lines)

1. One P0: both prod APIs' chain reads are down (keyed Helius devnet RPC over quota, 429) — bonds board, all 4 dossiers, schedule, holders and the registrar actions registry 500/502 on the NEW primary server; browser-side devnet is healthy, so it is server-side RPC quota. Owner must restore RPC before submission.
2. The proof fallback RPC (`publicnode`) is dead (404 to everything) → CORS console errors when devnet 429s; proof still reaches “All checks pass” in 40–52 s (slightly better than the old server's 45–90 s).
3. Security posture improved: all 27 guarded routes 401 (`/approvals` fixed), 502 bodies now generic, CORS still read-only, TLS valid on both hosts.
4. Regressions beyond the P0: `permissions-policy` header dropped on both hosts; one-off React #418 hydration mismatch on `/investor/placement` kk/390.
5. Clean everywhere else: 264 loads, 0 overflow at 390, 0 broken images, 0 raw keys, 0 untranslated enums (A91567-5 fixed), 5190/5190 explorer links devnet-tagged, no stalls; GitHub repo links still 404 (owner action).
