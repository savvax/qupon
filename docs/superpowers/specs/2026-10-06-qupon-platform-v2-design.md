# Qupon platform v2 — accounts, admin, KZT stablecoins, KASE data, networks, motion

**Status:** design approved in conversation 2026-10-06 ("go"); this document is the written spec.
**Builds on:** `docs/superpowers/specs/2026-10-05-qupon-product-design.md` (product v1, deployed at https://qupon.185-216-25-91.sslip.io).
**Deadline:** submission 2026-10-12 20:00 Almaty. Lead + GLM workers through the task queue.

## 1. Goal and success criteria

Turn the v1 product (demo roles, one network, two cash tokens) into a platform a real issuer, registrar and investor could use:

1. A **new investor** can sign up with email + password, link a Solana wallet by signing a message, apply for KYC with documents, get approved by a registrar (SAS attestation + registration on-chain), receive in-app notifications about coupons and meetings, and download statements and a tax certificate.
2. An **issuer organisation** has a profile, team members invited by link, and issue documents; it can tokenize a bond **listed on KASE** by ticker (terms and coupon schedule pre-filled from kase.kz) and pay it in **KZTE (Evo tenge stablecoin)**, USDC, test tKZT or a custodian-wrapped digital tenge token.
3. An **administrator** manages users, organisations, cash assets (added by mint address, verified on-chain), series visibility, demo limits, and sees system health (RPC, operator SOL balances, executor queue, scheduler, KASE sync) and the full audit trail.
4. The same build runs on **devnet** and is **mainnet-ready**: per-network profiles, mainnet guard rails, a mainnet deploy script with a dry run, and a readiness checklist in the admin panel. The program is **not** deployed to mainnet without the human's SOL, key and explicit confirmation.
5. Bond pages show **KASE market data** (price, bid/offer, last trades, issuer news) for series linked to a KASE ticker, and the registrar can compare the on-chain coupon schedule with KASE's.
6. The UI has a consistent, purposeful **motion** layer that respects `prefers-reduced-motion`.
7. Everything stays EN + RU, phone and desktop, with e2e coverage and the existing sweep green; every simulated part is labelled SIMULATED.

Out of scope: email/SMS delivery (notifications are in-app; password reset is an admin-issued one-time link), real KYC vendors, publishing to kase.kz (not possible without exchange membership), deploying to mainnet in this version, Kazakh language.

## 2. Facts this design rests on (researched 2026-10-06)

- **Evo (KZTE)** is a tenge-backed stablecoin on Solana mainnet issued by Intebix with Eurasian Bank inside the National Bank's digital-asset sandbox (launched 2025-09-23). It is not on devnet. Public token lists only show *impostor* tokens with the KZTE ticker (pump.fun mints, one holder each) — **a cash asset must never be resolved by ticker**.
- The **National Bank's digital tenge (CBDC)** is in circulation since 2026-07-18 on a private Hyperledger Fabric platform, not on Solana. On Solana it can only appear as a custodian-wrapped token (a bank holds CBDC and mints a 1:1 token). Qupon models this as an asset of kind `wrapped_cbdc`, SIMULATED custodian.
- **kase.kz** serves public JSON used by its own website (no account): `/api/instruments/bonds/{ticker}/`, `/api/instruments/bonds/{ticker}/characteristics/`, `/api/instruments/coupon-payments/{ticker}/`, `/api/instruments/trade-info/{ticker}/`, `/api/instruments/last-deals/{ticker}/`, `/api/instruments/docs/{ticker}/`, `/api/news/company/{issuer}/?language=ru|en`. It is unofficial: cache, rate-limit, attribute the source, degrade gracefully. The official IRIS API needs a registered account (captcha) and is read-only; it is not used (the human chose "no account").
- The on-chain program already accepts any cash mint under either token program (`cash_token_program: Interface<TokenInterface>`), so KZTE (classic SPL) needs no program change. The program id `QPN1…` is a vanity keypair we hold, so the same id can be deployed to mainnet.

## 3. Architecture changes

Unchanged: browser → Next.js (session cookie) → Go registrar API (bearer) → `qupon` CLI executor → Solana. New pieces:

```
apps/web
  (public)/signup, /verify-wallet …          investor self-registration
  (cabinet)/investor/{kyc,notifications,settings,reports}
  (cabinet)/issuer/{organization,team,documents}
  (cabinet)/registrar/{kyc,reports}
  (cabinet)/admin/{users,organizations,assets,series,system,demo,audit,network}
  components/motion/*                         motion primitives
services/registrar
  internal/accounts   sign-up, wallet linking (ed25519), invites, reset links
  internal/kyc        applications, documents, decisions
  internal/notify     notification fan-out from ingest events + KYC decisions
  internal/assets     cash-asset registry + on-chain mint verification
  internal/kase       kase.kz client, cache, normalisers
  internal/reports    CSV builders (statements, tax certificate, holder register, payouts)
  internal/network    network profile (devnet | mainnet-beta) and guard rails
clients/ts
  series:create --cash-mint <address>        any registered cash asset
ops/deploy-mainnet.sh                        program deploy, dry run by default
```

**One registrar instance per network.** `NETWORK=devnet|mainnet-beta` selects the profile (RPC, program id, explorer cluster, asset presets, guard rails). The web app reads its network from the API (`GET /network`) and shows it in the top bar. Production keeps running devnet; the mainnet profile is configured and checked by the readiness page but not deployed.

## 4. Data model (SQLite, new migration set `006_platform`)

| Table | Columns (key ones) | Notes |
|---|---|---|
| `users` (alter) | `org_id`, `status` (`active` / `disabled` / `pending`), `locale` | role adds `investor` (self-registered, not demo) |
| `organizations` | `id, name, kind (issuer/registrar), bin, website, created_at` | BIN = Kazakh business id, optional |
| `invites` | `token_hash, org_id, role, email, expires_at, used_at, created_by` | one-time link, 7 days |
| `reset_links` | `token_hash, user_id, expires_at, used_at, created_by` | admin-issued, 24 h |
| `wallets` | `user_id, address, verified_at, label` | unique `address`; one primary per user |
| `wallet_challenges` | `user_id, nonce, expires_at` | 10 min, single use |
| `kyc_applications` | `id, user_id, wallet, investor_type, residency, tax_bps, full_name, doc_ids, status (submitted/approved/rejected), reason, decided_by, decided_at, series_mints` | approval runs `kyc:attest` + `investor:register` per requested series |
| `documents` | `id, owner_user_id, org_id, kind, filename, mime, size, sha256, path, created_at` | stored under `/data/docs`, ≤ 10 MB, pdf/png/jpg only |
| `notifications` | `id, user_id, kind, payload_json, created_at, read_at` | in-app only |
| `cash_assets` | `network, mint, symbol, name, decimals, token_program, kind (spl/stablecoin/wrapped_cbdc/test), issuer_note, mint_authority, freeze_authority, verified_at, enabled` | unique (`network`, `mint`) |
| `series_settings` | `series_mint, org_id, hidden, kase_ticker, featured` | replaces `config/hidden-series.txt` (migrated on first start) |
| `kase_cache` | `key, body, fetched_at, status` | TTL per endpoint |

## 5. Subsystems

### 5.1 Networks and cash assets (foundation)
- `GET /network` → `{network, cluster, programId, explorerCluster, mainnet: bool, demoLogin: bool}`.
- **Mainnet guard rails** (enforced in Go, mirrored in UI): demo sign-in disabled; demo throttles irrelevant; every write requires `confirm: true` (the UI shows a typed-confirmation dialog naming the network); `series:create` requires an admin-approved cash asset; the network badge is red.
- **Cash asset registry:** `POST /admin/assets {mint}` reads the mint account on the instance's network, fills decimals / token program / authorities, stores it disabled; the admin confirms the symbol, kind and issuer note, then enables it. The UI warns when a freeze or mint authority exists and when the symbol collides with another asset. Presets seeded per network: devnet — tKZT, USDC (Circle devnet), `KZTE-dev` (our devnet mint standing in for Evo, labelled), `dKZT` (wrapped digital tenge, custodian SIMULATED); mainnet — USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) enabled, KZTE **added disabled with an empty mint** until the address is taken from an official Intebix/Eurasian Bank source.
- **Issuer wizard** offers the enabled assets of the network; `series:create --cash-mint <address>` replaces the `tkzt|usdc` alias (alias kept for the CLI's own scripts).
- **Wrapped CBDC (`dKZT`)**: an admin "custodian" page mints dKZT to an issuer's treasury against a recorded (SIMULATED) CBDC deposit reference and burns it on withdrawal; every movement is audited.
- `ops/deploy-mainnet.sh`: verifiable docker build, checks the program keypair and upgrade authority, prints the plan and cost estimate; deploys only with `--execute` and an interactive confirmation. Not run in this version.
- Admin **Network** page: readiness checklist per profile (program deployed? upgrade authority? operator keys funded? assets configured? RPC healthy?).

### 5.2 Admin panel (`/admin`, role `admin`)
Users (list, create, change role/org, disable, issue reset link), Organisations, Cash assets, Series (visibility, featured, KASE ticker link), System (RPC latency, slot, operator SOL balances with low-balance warning, executor queue depth, scheduler state, ingest lag, KASE cache status), Demo (limits, `demo-seed` trigger through the executor, reset of demo notifications), Audit (filters by user/role/route/status/date, CSV export), Network (5.1). All writes audited.

### 5.3 Accounts and cabinets
- **Sign-up** (`/signup`): email, name, password (≥ 10 chars, not in a short deny-list), locale; creates role `investor`, status `active`; rate-limited per IP like sign-in.
- **Wallet linking:** `POST /me/wallets/challenge` → nonce; the browser signs `Qupon wallet link\n<email>\n<address>\nnonce:<n>` with the wallet adapter's `signMessage`; `POST /me/wallets {address, signature}` verifies ed25519 in Go and stores the wallet. Unit-tested with a known key pair and a forged signature.
- **KYC application** (`/investor/kyc`): type, residency, tax rate, full name, documents (ID scan), series to join. Status timeline. Review is SIMULATED (no vendor): the registrar decides.
- **Registrar KYC queue** (`/registrar/kyc`): list, document preview, approve (runs `kyc:attest` + `investor:register` for each requested series through the executor — existing endpoints) or reject with a reason.
- **Devnet faucet:** a signed-in investor with a verified wallet can request test cash (tKZT, KZTE-dev, dKZT) once per hour per asset; disabled on mainnet.
- **Notifications:** generated by the ingest poller for holders of the affected series (`ActionAnnounced`, `EntitlementPaid` for that holder, meeting opened/finalized) and by KYC decisions and invites; bell with unread count in the top bar, list page, mark read.
- **Profile/settings:** name, locale, password change, linked wallets.
- **Issuer organisation:** profile, team (invite by link with role issuer, remove member), documents (prospectus, decisions) attached to series.
- Demo identities keep working on devnet; they become real `users` rows tied to demo organisations so every cabinet page works the same for demo and real accounts.

### 5.4 Reports
CSV and printable HTML (the browser's "Save as PDF"; no server PDF engine): investor statement (holdings, payouts with tx links), annual tax certificate (gross / withheld / net per payout), registrar holder register at a record date, issuer payout report per action. Generated from on-chain read models + entitlements; every file carries network, generation time and source accounts.

### 5.5 KASE (public data)
- `internal/kase`: client with a 5 s timeout, `User-Agent: Qupon (hackathon prototype; contact in README)`, at most 1 request/second, cache TTL 1 h (characteristics, coupons, docs), 5 min (market data), 30 min (news); `kase_cache` keeps the last good body for fallback.
- Normalised endpoints: `GET /kase/bonds/{ticker}` → `{ticker, isin, issuer, currency, face, couponRate, frequency, issueDate, maturityDate, schedule[{recordDate, start, end, rate}], market{price, bid, offer, volume, date}}`; `GET /kase/news/{issuer}?lang=`.
- **Tokenize a listed bond:** the issuer wizard has "Import from KASE" by ticker → pre-fills terms and shows KASE's schedule next to the preview; mismatches are highlighted.
- **Bond page:** KASE panel for series with a linked ticker (market price, bid/offer, last trades, issuer news), "Source: kase.kz" with the fetch time.
- **Schedule check** on the registrar action page: KASE fixation date vs on-chain record date for the period.
- Disclosure package: the existing notice + ISO files zipped per action, "Submit to KASE — SIMULATED".

### 5.6 Motion
- Library `motion` (`motion/react`) with `LazyMotion` + `domAnimation` (≈ 15 kB); primitives in `components/motion`: `FadeIn`, `Stagger`, `CountUp`, `PresenceList`, `Pulse`, page transition wrapper.
- Tokens: durations 120 / 200 / 300 ms, easing `[0.2, 0.8, 0.2, 1]` (ease-out) and a soft spring for toasts and dialogs.
- Where: route transitions in cabinets (fade + 8 px rise), staggered table rows and cards on first load, KPI numbers count up, Stepper fill animates to the current step, status badge pulses once when polling sees a new status, toasts spring in, dialogs scale from 98 %, landing hero: subtle grid drift and card float (no parallax on phones).
- `prefers-reduced-motion: reduce` → all primitives render final state instantly; checked by an e2e that emulates reduced motion.

### 5.7 Solana wallet connection (added 2026-10-06 after review)
- The wallet is a first-class action: a **Connect wallet** button in the public header and the cabinet top bar; once connected it becomes a chip (wallet icon, short address, network) with a menu: copy address, open in explorer, link to account (signed message, §5.3), disconnect.
- **Detection** via the Wallet Standard (wallet-adapter `wallets` with `readyState`): exactly one installed wallet → the button connects to it directly ("Connect Phantom"); several → a picker listing the installed ones first (icon, name, "Detected"), then popular ones to install; none → a panel explaining what a Solana wallet is, install links (Phantom, Solflare, Backpack) and two fallbacks: open this page inside a mobile wallet browser (deep links) and **view by address** (paste a public key for a read-only portfolio; signing actions stay disabled with an explanation).
- Our own dialog in the design system, EN/RU, animated; the generic English wallet-adapter modal is no longer shown anywhere.

### 5.8 UX quality bar (added 2026-10-06)
- No layout shift between locales: hero and headers keep their size in EN and RU (fixed heights, clamp() type, no wrapping nav); every page has loading, empty and error states; focus states visible; touch targets ≥ 40 px; consistent spacing scale.
- The landing hero is alive: slow aurora/grid background drift and a lifecycle card that plays a corporate action (segments fill step by step, status chip and amounts update) — all transform/opacity, paused off-screen, static under reduced motion.
- More micro-interactions: press/hover feedback on buttons and cards, sliding active indicators (nav, tabs), shimmer skeletons, copy confirmations, value transitions when polled numbers change.
- Next.js dev indicator off (it is English-only and confused reviewers).

## 6. Security
- New roles: `investor` (self-service), `admin`; issuer/registrar members belong to an organisation and act within it (issuer writes limited to series whose `series_settings.org_id` is their organisation; demo organisation for demo users). The on-chain issuer authority stays the platform's custodial operator key, as in v1 — organisations are an off-chain access boundary, not separate keys.
- Wallet linking requires a fresh, single-use nonce bound to user and address; signatures over anything else are rejected.
- Documents: size/type allow-list, stored outside the web root, served only to the owner, their organisation and registrars/admins, with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- Invite and reset tokens: 32-byte random, stored hashed, single use, expiring; admin actions audited.
- Mainnet guard rails (5.1). The keyed RPC stays server-side (9309 fix applies to every new client).
- KASE client: no user input reaches URLs except validated tickers (`^[A-Za-z0-9]{2,12}$`) and issuer codes.

## 7. Testing
Unit: ed25519 wallet-link verification, mint verification (decimals, authorities, token program), KASE normalisers against saved fixtures, report CSV builders against the brief's numbers (500 / 1,250 / 3,250), role/organisation access matrix for every new route. E2E (mock mode): sign-up → wallet link (mocked signer) → KYC submit → registrar approve → notification; admin user/asset flows; KASE import into the wizard (fixture); reports download; reduced-motion snapshot. Sweep extended to every new page. Live: devnet run of sign-up → KYC approval → coupon → notification → statement.

## 8. Delivery (plans)
| Plan | Content | Owner |
|---|---|---|
| 6 | Networks + cash-asset registry + CLI `--cash-mint` + wizard asset picker + mainnet guard rails + deploy script (dry run) | lead (program/CLI glue, guards) + GLM (admin asset UI) |
| 7 | Admin panel | GLM (pages), lead (system health, audit filters review) |
| 8 | Accounts: sign-up, wallet linking, KYC applications + registrar queue, notifications, profile, organisations/invites, documents | lead (wallet linking, KYC executor glue), GLM (pages) |
| 9 | Reports and exports | GLM |
| 10 | KASE integration | GLM (client, normalisers, panels), lead (wizard import review) |
| 11 | Motion system | lead (primitives), GLM (application across pages) |
| 12 | Hardening: e2e, sweep, live devnet run, deploy, docs/README/submission | lead |

Plan 5 (`2026-10-06-plan5-kz-general-track.md`) is the submission plan and runs alongside.

**Cut line if time runs short:** wrapped-CBDC custodian page, annual tax certificate and password step-up for mainnet writes move to the roadmap first; everything else is in scope.

## 9. Risks
- kase.kz internal API can change or block automated access → cache + fixtures + "data unavailable" state; never block a flow on KASE.
- Real KZTE mint unknown → mainnet asset ships disabled; no ticker resolution anywhere.
- Scope vs 6 days → plans run in parallel; the cut line above is decided in advance.
