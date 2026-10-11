# Live production sweep — routes, locales, errors, links (task 91567)

Date: 2026-10-12 (pre-submission audit). Prod: `https://qupon.85-192-29-7.sslip.io` + API `https://api.85-192-29-7.sslip.io`, devnet.
Method: Playwright (Chromium headless), `reports/audit/tools/live-sweep{,2,3,4}.cjs` — 289 page-loads in round 1 (every public route + every demo-reachable cabinet route × en/ru/kk × 1440/390), then targeted re-verification rounds with isolated listeners. GET-only except the sanctioned one-click demo sign-in; exactly ONE sandbox created (`SBX-EETXZG`, reused per session). Machine report: `/tmp/live-sweep.json` (round 1, not committed — listener bug polluted per-page failure arrays; union view + rounds 2–4 are authoritative).

Coverage: `/`, `/bonds` (+ all 4 showcase dossiers incl. the closed one), `/learn`, `/proof` + both listed proof mints, `/sandbox/new`→`/sandbox/<id>`, `/holder/<owner>`, `/login`, `/signup`, `/invite` (+`/invite/<bad-token>`), `/reset/<bad-token>`, `/forbidden`, `/does-not-exist`, legacy redirects (`/console`, `/portal`), issuer (6 routes), registrar (8 lists + 4 action details + kyc detail), investor (6), `/admin` logged out. Demo roles offered on prod: **issuer, registrar, investor** (no admin button — by design; `/admin` correctly bounces anonymous users to `/login`).

---

### A91567-1 [P1] Web server intermittently stalls >45 s with no response
**Where:** `https://qupon.85-192-29-7.sslip.io` (VPS web container; deployed via `ops/deploy-vps.sh` — 1 vCPU, docker compose).
**Evidence:** During the sweep, `page.goto` failed with `net::ERR_TIMED_OUT` (45–60 s, `domcontentloaded`) on `/proof/E4EH…kFuD` and `/login` (×3); `curl --max-time 70 -o /dev/null -w "%{http_code} %{time_total}s" …/login` → `000 70.005807s` while `curl …/api…/healthz` in the same loop answered `200 0.836s` — the API is healthy, the web container is not. ≈5 stalls in ~370 requests (~1.5 %); every stall self-recovered. While stalled, `/login` renders without the demo-role buttons (the SSR stream for the DemoPanel segment never arrives), which breaks the primary demo path for that request.
**Fix:** `ops/deploy-vps.sh` / web container — profile the stall on the box (`docker stats`, event-loop blocking; a concurrent image build on 1 vCPU is a suspect) and add a latency probe to `ops/watchdog.sh` (it checks status only, not response time).

### A91567-2 [P1] `/proof` sub-checks take ~45–90 s against public devnet RPC; the certificate looks unfinished to an impatient judge
**Where:** `/proof/7MBQ7yA7CBgktQZ5k9GCwHPcWtMANUhJgQHCRrXzC35F` (28 txs) and `/proof/E4EH…kFuD` (46 txs).
**Evidence:** At +6–8 s the page shows the entitlement verdict (`3 of 3 ✓`) but four history-derived checks hang on `Reading the transaction history (10 of 28)…` (snapshot coverage, escrow funded, payouts match, default-and-cure) while `api.devnet.solana.com` intermittently answers `429 POST`. At +45 s the page reaches `16/16 · All checks pass` (`9 of 9 ✓`). Shot: `shots/audit-live-sweep/proof-midread-en-1440.jpg`. The entitlement math (the scored criterion) is fast and correct — only the transaction walk is slow.
**Fix:** `apps/web` proof walker — batch `getTransaction` calls / add a second RPC endpoint (or cache the walked history per mint), and show an ETA so judges know to wait.

### A91567-3 [P1] The public board defaults to “Active” and hides the completed redemption showcase (Astana-Metro)
**Where:** `/bonds` (`apps/web/src/app/(public)/bonds/page.tsx`); series `KZ2C0QPN0026` mint `GKRsSH9vkqAdKcVsHY8aAhUGUt5iAGPSarRTWBFrR93k`.
**Evidence:** `GET /series` returns all four showcase series; Astana-Metro is `Closed` (its 6-month accelerated life ended), so the default board lists only Almaty-Power / Aktobe-Mining / Atyrau-Oil — the redemption scenario, one of the three required demo scenarios, is invisible until the judge clicks the “All” chip (verified: “All” shows all four incl. `Closed`). Its dossier is the best redemption evidence on the site (65/25/10 bonds → 3 250/1 250/500 ₸ + 10 000 ₸ principal, retired tokens, journal). Shot: `shots/audit-live-sweep/bonds-default-active-en-1440.jpg`.
**Fix:** default the board filter to “All”, or add a “Completed redemptions” section that links the closed dossier.

### A91567-4 [P2] SIMULATED KASE notice renders in English on the RU action page
**Where:** `/registrar/actions/HoEwnW6oJSNgLjV2w5XViG4cY9RqUCmqdySDRpXCGFCu` with `NEXT_LOCALE=ru` (notice text produced by `services/registrar` notice templates).
**Evidence:** RU page dump contains the raw notice line: `«/KASE, 2026-10-11/ – Qupon Issuer Demo has paid the principal and the final coupon on its bonds KZ2C0QPN0026 (Astana-Metro) …»` — surrounding UI is fully Russian. Shot: `shots/audit-live-sweep/registrar-action-notice-ru-1440.jpg`.
**Fix:** select the notice template locale from the visitor's locale (RU/KK templates are already an allowed exception per AGENTS.md), and label the notice SIMULATED.

### A91567-5 [P2] Registrar activity log shows raw instruction enums on ru/kk
**Where:** `/registrar/activity` (ru/kk).
**Evidence:** visible text contains `close_series, sweep_escrow, complete_action, confirm_bank_payout, pay_batch, fund_action, finalize_snapshot, snapshot_batch` (program instruction names used as activity labels). Shot: `shots/audit-live-sweep/registrar-activity-ru-1440.jpg`.
**Fix:** map instruction names through the activity i18n keys in `apps/web/messages/{ru,kk}.json`.

### A91567-6 [P2] Footer/landing links point at the still-private repo `github.com/savvax/qupon`
**Where:** `apps/web/src/components/shell/PublicShell.tsx:17` (footer “Source code”, “Technical overview”) and `apps/web/src/app/(public)/_landing/Hero.tsx:13`, `_landing/sections.tsx:244,252`.
**Links (listed, not chased, per task rules):** `https://github.com/savvax/qupon`, `…/blob/main/docs/TECHNICAL_OVERVIEW.md`, `…/blob/main/reports/verified-build.md`. Owner action to make the repo public / grant Colosseum access is in progress.
**Fix:** owner flips visibility before submission (no code change).

### A91567-7 [P2] Currency formatting differs between pages (₸ spacing)
**Where:** `/bonds` board “`1,000.00₸`” (no space) vs `/proof` “`1,000.00 ₸`” (narrow space) — same locale (en); ru consistently uses “`1 000,00₸`”.
**Evidence:** round-2 text dumps (`/tmp/sweep2.log`, board vs certificate sections).
**Fix:** route both through one shared KZT formatter in `apps/web/src/lib`.

---

## Verified clean (no finding)
- **0 console errors** across 289 loads (next-intl missing-message errors would have surfaced here); **0 horizontal overflow at 390 px** on every route/locale; **0 broken images**; **no raw i18n keys** (`api.devnet.solana.com` on the proof page is the RPC host name, not a key); **no NaN/undefined/Invalid Date** anywhere.
- Locales: every public page localizes title/hero/nav in ru/kk; numbers and dates localize (ru `10,00 %`, `11.10.2026`); the closed dossier's redemption table renders identically in en/ru/kk. `/ui`-style English-only pages are dev-only and not deployed.
- Legacy redirects work (`/console`→`/login`, `/portal`→`/investor`, `/series/<mint>`→`/bonds/<mint>`); `/does-not-exist` serves the localized 404 page; `/invite` and `/holder` bare paths 404 by design (token/address required; nothing links the bare forms; `/holder/<owner>` and `/invite/<token>` render correct invalid-token/holder states).
- Demo sign-in (issuer/registrar/investor) works; the one sandbox created (`SBX-EETXZG`) completes in ~30 s and localizes; `/admin` gated.
- External links: all 151 `explorer.solana.com` links carry `?cluster=devnet` (0 missing). HEAD probes of explorer return 429 to CLI clients (edge bot filtering) — URLs are well-formed and the signatures come from live chain reads; not chased further. API links on pages answer 200 to GET (405 to HEAD).
- Investor cabinet renders for anonymous visitors by design (`apps/web/src/app/(cabinet)/investor/layout.tsx` — open to wallet investors).

## Summary (5 lines)
1. No P0: every route answers, all three locales render, no console errors, no overflow at 390, no broken links that a browser would hit.
2. Biggest risk is infrastructure: the web container stalls >45 s ~1.5 % of requests (A1) — profile before the demo; API and devnet flow are healthy.
3. `/proof` is correct but needs ~45–90 s to reach “All checks pass” on public RPC (A2) — batch/cache the transaction walk or judges may score an unfinished page.
4. Board default filter hides the completed redemption showcase (A3) — the strongest on-chain redemption evidence is one chip-click away from invisible.
5. Polish: English SIMULATED notice on ru (A4), raw enums in activity ru/kk (A5), private-repo links (A6), ₸ spacing (A7).
