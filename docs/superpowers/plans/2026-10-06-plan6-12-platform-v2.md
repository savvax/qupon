# Plans 6–12 — Qupon platform v2 Implementation Plan

> **For agentic workers:** each task below is one queue task (`tasks/todo/<id>-*.md` says "implement task <id> of this plan"). Read the spec section the task cites, then the files under **Read first**, then implement. Steps use checkbox (`- [ ]`) syntax.

**Goal:** accounts (sign-up, wallet linking, KYC, notifications, organisations, reports), an admin panel, a cash-asset registry with KZT stablecoins, kase.kz market data, devnet + mainnet-ready network profiles, and a motion layer — on top of the deployed v1 product.

**Architecture:** Go registrar grows feature packages (`internal/{assets,kase,notify,reports}`) and feature handler files that mount their own routes; SQLite migration `006_platform.sql` (task 600) creates every new table up front; the Next.js app gets an `/admin` cabinet, a shared `/account` area, feature-scoped i18n and mock files. The on-chain program is unchanged.

**Tech Stack:** Go 1.26 + chi + sqlite + solana-go v2; Next.js 15 app router + Tailwind v4 + next-intl + Radix + `@solana/wallet-adapter-react`; `motion` (new, task 1101); Playwright + vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-qupon-platform-v2-design.md` (sections cited as §N).

## Global Constraints

- Devnet only at runtime. Nothing in this plan sends a transaction to mainnet or reads mainnet RPC; the mainnet profile is configuration plus a dry-run script.
- Never commit secrets: `.env`, `~/.config/qupon/*.json`, the Helius key, invite/reset tokens. Logs and audit rows never contain tokens or passwords.
- Every simulated part is labelled `SIMULATED` in code comments, UI and docs (KYC review, wrapped-CBDC custodian, KASE submission).
- UI strings EN + RU; RU is natural Russian (financial register), not transliteration.
- **Go feature layout:** handlers in a new file `services/registrar/internal/api/<feature>.go` exposing `func mount<Feature>(r chi.Router, deps Deps, st *store.Store)`; the task replaces exactly its own anchor comment `// mount: <feature>` in `internal/api/api.go` with the call. Store methods in a new file `internal/store/<feature>.go`. Never edit another feature's files.
- **Go conventions:** `writeErrorCode(w, status, code, msg)` for errors (codes are snake_case and listed in the task); `audit(st, r, params, ok, detail, sigs)` on every write; `requireRole(deps.Auth, roles...)` (admin passes every role check) or `requireUser(deps.Auth)` (any signed-in user) from task 600; context everywhere, errors wrapped with `%w`, table tests.
- **No OpenAPI edits in feature tasks** — task 1204 documents every new route in both `openapi.yaml` copies.
- **Web feature layout:** strings in `apps/web/messages/{en,ru}/<ns>.json` (namespaces pre-created by task 600: `admin, account, kyc, notify, org, reports, kase, assets, network`); mock-mode handlers in `apps/web/src/mocks/features/<ns>.ts` (pre-created, consulted by `mockGet` / the `/api/bo` mock branch); e2e in `apps/web/e2e/<feature>.spec.ts` running in mock mode. Server reads with `boFetch`, writes with `boPost` + `useRunWrite`; UI only from `components/ui/*` and `components/shell/*`.
- Browser writes go through `/api/bo/<path>`; task 600 widens the allowlist to `^(issuer|registrar|demo|admin|me|org)/…`. File uploads use `/api/bo-upload/<path>` (task 803).
- **Do not touch `corsReadOnly` in `internal/api/api.go`** (decided 2026-10-06, task 9601): public GET/HEAD reads echo the request Origin and never send `Access-Control-Allow-Credentials`; writes get no CORS headers. If a scanner flags it, leave it — the lead owns this decision.
- Tests use the brief's numbers (10/25/65 units, 1,000 KZT face, 10% semi-annual → 500/1,250/3,250).

## Review Focus

- A user signs in after an admin disables them → sign-in refused, existing sessions dead (task 701 test).
- A wallet-link signature made for another user, address or an expired/used nonce → rejected (task 801 test).
- A cash asset added by mint whose account is not a mint, belongs to neither token program, or has a freeze authority → rejected or flagged, never silently enabled (task 601 test).
- kase.kz answers 5xx, HTML, or times out → API answers with the cached body marked `stale: true`, or `kase_unavailable`; no page breaks (task 1001 test + 1002 e2e).
- An investor opens another investor's document or report by id → 404 (tasks 803, 901 tests).

---

## Plan 6 — Networks and cash assets (§5.1)

### Task 600 (lead): platform foundation
**Files:** create `services/registrar/migrations/006_platform.sql`, `internal/network/network.go(+_test)`, `internal/store/{organizations,cash_assets,series_settings}.go(+_test)`, `internal/kase/testdata/*.json` (captured kase.kz bodies); modify `internal/api/api.go` (anchors, `GET /network`, `requireUser`), `cmd/registrar/main.go` (seed demo orgs, asset presets, hidden-series import); web: `src/lib/session.ts` (role `investor`, admin home `/admin`), `src/lib/network.ts`, `src/components/shell/NetworkBadge.tsx`, `src/app/(cabinet)/nav.tsx` (admin + account nav), `src/app/(cabinet)/admin/layout.tsx`, `src/i18n/request.ts` (merge namespace files), `messages/{en,ru}/*.json`, `src/mocks/features/*.ts` + registry, `src/app/api/bo/allowlist.ts`.
**Produces:** tables of §4; `network.Profile{Name, Cluster, ProgramID, ExplorerCluster string; Mainnet bool}` and `network.FromEnv()`; `GET /network`; `requireUser`; store types `Organization`, `CashAsset`, `SeriesSettings` with `ListCashAssets(ctx, network, onlyEnabled)`, `UpsertCashAsset`, `GetCashAsset(ctx, network, mint)`, `ListSeriesSettings`, `UpsertSeriesSettings`, `ListOrganizations`, `CreateOrganization`, `GetOrganization`; web `getNetwork()`; `Role = "issuer" | "registrar" | "investor_demo" | "investor" | "admin"`.
- [ ] migration (users table rebuilt to widen the role CHECK and add `org_id, status, locale`), store + tests, network + tests, `/network`, seeding, web foundation; `make verify` green; commit.

### Task 601 (glm): cash-asset registry API
**Read first:** spec §5.1, `internal/chain/tokens.go`, `internal/store/cash_assets.go`, `internal/api/rbac.go`.
**Files:** create `internal/assets/verify.go(+_test)`, `internal/api/assets.go(+_test)`.
**Interfaces:** `assets.VerifyMint(ctx, c *chain.Client, mint solana.PublicKey) (assets.MintInfo, error)` with `MintInfo{Mint, TokenProgram string; Decimals uint8; Supply string; MintAuthority, FreezeAuthority *string}`; errors `assets.ErrNotMint`, `assets.ErrUnknownProgram`.
Routes (`mountAssets`): `GET /assets` (public; enabled assets of this network: `[{mint, symbol, name, decimals, kind, tokenProgram, freezeAuthority, mintAuthority}]`), `GET /admin/assets` (admin; all), `POST /admin/assets {mint}` → verifies on-chain, stores **disabled** with on-chain fields, `201 {asset, warnings: ["freeze_authority"|"mint_authority"|"symbol_collision"]}`; `PATCH /admin/assets/{mint} {symbol?, name?, kind?, issuerNote?, enabled?}`; codes `invalid_params`, `not_a_mint`, `unknown_token_program`, `asset_exists`, `not_found`.
- [ ] Test: VerifyMint on fixture account bytes — classic SPL mint (82 bytes, owner Tokenkeg…), Token-2022 mint with extensions (owner Tokenz…), an account owned by another program → `ErrUnknownProgram`, a token *account* (165 bytes) → `ErrNotMint`.
- [ ] Test: handler — non-admin 403; add → disabled; enabling an asset with a freeze authority requires `{"enabled": true, "acceptFreezeAuthority": true}` else `400 freeze_authority_unconfirmed`; symbol collision returns a warning.
- [ ] Implement, `make verify`, commit `feat(registrar): cash-asset registry with on-chain mint verification (task: 601)`.

### Task 602 (lead): any registered cash asset for new series
**Files:** `clients/ts/src/commands/seriesCreate.ts` (`--cash-mint <address>` alternative to `--cash`), `internal/api/issuer.go` (`cashMint` field: must be an enabled asset of this network; `cash` alias kept and mapped to the tKZT/USDC asset), web issuer wizard cash picker from `GET /assets` (decimals drive `parseMajor`).
- [ ] CLI test, API test (disabled asset → `400 asset_not_enabled`), wizard e2e in mock mode; commit.

### Task 603 (glm): devnet test assets and faucet
**Read first:** `clients/ts/scripts/create-tkzt.ts`, `clients/ts/src/commands/common.ts`, spec §5.1.
**Files:** create `clients/ts/scripts/create-test-asset.ts`, `clients/ts/src/commands/asset.ts(+test)`; modify `clients/ts/src/cli.ts` (register), `config/devnet.json` (`testAssets: [{symbol, mint, decimals, kind}]`, written by the script), `internal/api/faucet.go(+_test)`.
- `create-test-asset.ts --symbol KZTE-dev --name "Evo tenge (devnet stand-in)" --decimals 2 --kind stablecoin` creates a **classic SPL** mint (like mainnet KZTE) with mint authority = the registrar operator key; `--symbol dKZT --name "Digital tenge (custodian-wrapped, SIMULATED)" --kind wrapped_cbdc` likewise. Idempotent: skips when the symbol already exists in `testAssets`.
- `qupon asset:faucet --mint <addr> --to <owner> --amount <minor>`: creates the owner's ATA if needed and mints; refuses mints not in `testAssets`; JSON output `{ok, signature, ata}`.
- `mountFaucet`: `POST /me/faucet {mint}` — any signed-in user with a verified wallet (store `ListWallets` from task 801; the tokens go to the first verified wallet), only on non-mainnet profiles (`403 mainnet`), only assets with kind `test|stablecoin|wrapped_cbdc` present in `testAssets`, amount = 100,000 major units, limit 1 per user per mint per hour (`429 rate_limited`). Runs the CLI through the executor; audit.
- [ ] Tests: CLI refuses unknown mint; handler mainnet → 403, second call within the hour → 429.
- [ ] Run the script on devnet for KZTE-dev and dKZT (keys in `~/.config/qupon`), commit the updated `config/devnet.json` (public keys only).

### Task 604 (glm): admin cash-assets page
**Read first:** spec §5.1, task 601 routes, `src/app/(cabinet)/registrar/investors/page.tsx` (table pattern).
**Files:** create `src/app/(cabinet)/admin/assets/{page.tsx,AddAssetDialog.tsx,AssetRow.tsx}`, fill `messages/{en,ru}/assets.json`, `src/mocks/features/assets.ts`, `e2e/admin-assets.spec.ts`.
- Table: symbol, name, kind badge, decimals, token program (SPL / Token-2022), authorities (warning chip when a freeze/mint authority exists), enabled switch, explorer link. "Add by mint address" dialog: paste address → POST → shows the verified fields and warnings → admin fills symbol/name/kind/note → PATCH → optional enable (freeze-authority checkbox when needed). Copy explains "assets are identified by mint address; tickers can be faked".
- [ ] e2e: add asset → warning shown → enable; RU strings render.

### Task 605 (lead): mainnet-ready profile and guard rails
**Files:** `config/mainnet-beta.json` (programId, USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` enabled, KZTE entry disabled with empty mint and a note), `internal/network` guard middleware (mainnet: `/auth/demo` and `/demo/*` → `403 demo_disabled`; every write requires `confirm: true` in the JSON body → `428 confirmation_required`), web typed-confirmation dialog in `useRunWrite` when `getNetwork().mainnet`, `ops/deploy-mainnet.sh` (dry run default: checks keypair pubkey = programId, `solana program show` absent, prints size and `solana rent` estimate; `--execute` needs typing the program id), `src/app/(cabinet)/admin/network/page.tsx` (current profile, checks: program executable, upgrade authority, operator SOL balances, enabled assets, RPC health; plus the static mainnet checklist), `docs/07-mainnet.md`.
- [ ] Go tests for the guard; e2e for the network page; commit. **The script is never run with `--execute` by an agent.**

### Task 606 (glm, T2 — cut line): wrapped-CBDC custodian page
`/admin/custodian`: record a SIMULATED CBDC deposit reference + amount → mint dKZT to an issuer treasury via `asset:faucet`-style CLI (`asset:mint --mint dKZT --to … --amount … --memo <ref>`); withdrawals burn; ledger table from audit rows. Labelled SIMULATED everywhere.

## Plan 7 — Admin panel (§5.2)

### Task 701 (glm): admin users, organisations, series settings, audit API
**Read first:** spec §5.2, §6; `internal/store/users.go`, `internal/auth/service.go`, `internal/api/auth.go`, task 600 store files.
**Files:** create `internal/api/admin.go(+_test)`, `internal/store/admin.go(+_test)`.
Routes (`mountAdmin`, all `requireRole(deps.Auth, "admin")` except reset): `GET /admin/users?q=&role=&status=`, `POST /admin/users {email, name, role, orgId?, password}`, `PATCH /admin/users/{id} {role?, orgId?, status?, name?}` (status `disabled` deletes the user's sessions), `POST /admin/users/{id}/reset-link` → `{url, expiresAt}` (token 32 random bytes, base64url, stored as sha256, 24 h, shown once), `GET/POST /admin/organizations`, `PATCH /admin/organizations/{id}`, `GET /admin/series` (every series incl. hidden, joined with settings), `PATCH /admin/series/{mint} {hidden?, featured?, kaseTicker?, orgId?}` (ticker `^[A-Za-z0-9]{2,12}$`), `GET /admin/audit?user=&role=&route=&ok=&from=&to=&limit=&format=csv`. Public: `POST /auth/reset {token, password}` (password ≥ 10 chars; consumes the token; revokes sessions). Admins cannot disable or demote themselves (`400 self_lockout`).
- [ ] Tests: disabled user → login `401 bad_credentials` and old session `401`; reset token works once, expired → `400 invalid_token`; non-admin → 403; audit CSV has a header row and escapes commas; `PATCH /admin/series` hidden=true removes it from `GET /series`.

### Task 702 (glm): system health API
**Files:** create `internal/api/system.go(+_test)`; small accessors in `internal/executor/executor.go` (`Stats() (running, queued int)`) and `internal/scheduler/scheduler.go` (`LastTick() time.Time`), `internal/ingest/ingest.go` (`LastSlot() uint64`) — additive only.
`GET /admin/system` (admin) → `{network, rpc: {ok, latencyMs, slot}, operators: [{name, address, sol, low}], executor: {running, queued, maxConcurrent}, scheduler: {enabled, lastTick}, ingest: {lastSlot, lagSlots}, kase: {entries, lastFetch, lastError}, demo: {writesPerHour, seriesPerDay}}`; operator list = registrar, issuer, paying agent public keys from config; `low` when < 0.5 SOL; RPC probe with a 2 s timeout, never prints the RPC URL.
- [ ] Test with a fake chain client: slow RPC → `ok:false` within 2.5 s; low balance flagged.

### Task 703 (glm): admin pages — users, organisations, reset link page
**Files:** `src/app/(cabinet)/admin/users/{page.tsx,UserDialog.tsx}`, `src/app/(cabinet)/admin/organizations/page.tsx`, `src/app/(public)/reset/[token]/page.tsx` + `src/app/api/session/reset/route.ts`, `messages/*/admin.json` (users/orgs keys), `src/mocks/features/admin.ts`, `e2e/admin-users.spec.ts`.
- Users: search, role/status filters, create dialog, edit role/org/status, "Reset link" → modal with copy button and expiry. Organisations: list, create, edit.
- [ ] e2e: create user, disable user, reset-link modal shows a URL; reset page sets a password (mock).

### Task 704 (glm): admin pages — series and audit
**Files:** `src/app/(cabinet)/admin/series/page.tsx`, `src/app/(cabinet)/admin/audit/page.tsx`, `messages/*/admin.json` (series/audit keys — add keys under `admin.series`, `admin.audit` only), `src/mocks/features/admin.ts` (append), `e2e/admin-series-audit.spec.ts`. Remove `config/hidden-series.txt` usage from `ops/deploy-vps.sh` (task 600 imports it once).
- Series: visibility switch, featured switch, KASE ticker input, organisation select. Audit: filters (user, role, route, ok, date range), table, "Export CSV" link to `/api/bo-get/admin/audit?format=csv` (task 600 adds the GET proxy for CSV downloads).
- [ ] e2e: hide a series; filter audit; CSV link has the filters.

### Task 705 (glm): admin overview and system pages
**Files:** `src/app/(cabinet)/admin/page.tsx`, `src/app/(cabinet)/admin/system/page.tsx`, `messages/*/admin.json` (`admin.overview`, `admin.system`), mocks, `e2e/admin-overview.spec.ts`.
- Overview KPIs (users by role, pending KYC, series, open actions, low-balance operators) with links; System page renders `/admin/system` with status dots and refresh every 15 s.

## Plan 8 — Accounts and cabinets (§5.3)

### Task 801 (lead): wallet linking
Go `mountWallets`: `POST /me/wallets/challenge {address}` → `{message, expiresAt}`; `POST /me/wallets {address, signature}` (base58 ed25519 over the exact message; nonce single use, 10 min, bound to user+address; address unique across users → `409 wallet_taken`); `GET /me/wallets`; `DELETE /me/wallets/{address}`. Web `components/account/WalletLink.tsx` (wallet-adapter `signMessage`) and `/account` wallets section. Tests: valid, wrong address, reused nonce, expired nonce, signature by another key.

### Task 802 (glm): investor sign-up
**Files:** `internal/api/signup.go(+_test)`, `src/app/(public)/signup/{page.tsx,SignupForm.tsx}`, `src/app/api/session/signup/route.ts`, `messages/*/account.json` (`account.signup`), `e2e/signup.spec.ts`; link "Create an account" on `/login`.
`POST /auth/signup {email, name, password, locale}` → creates role `investor`, status `active`, `org_id` NULL, returns a session like `/auth/login`; email lower-cased and validated; password ≥ 10 chars and not in a 20-word deny list; `409 email_taken`; shares `SignInLimit`. Disabled on mainnet? No — sign-up stays open on every network.
- [ ] Tests: duplicate email, weak password, rate limit; e2e sign-up lands on `/investor` with an onboarding banner "Link a wallet → apply for KYC".

### Task 803 (glm): documents and KYC API
**Files:** `internal/api/kyc.go(+_test)`, `internal/api/documents.go(+_test)`, `internal/store/kyc.go`, `internal/store/documents.go`; refactor `registrarOnboard` into `onboardInvestor(ctx, deps, st, req OnboardRequest) (OnboardResult, error)` reused by both; web upload proxy `src/app/api/bo-upload/[...path]/route.ts` (multipart, `me/documents` and `issuer/series/*/documents` only, same-origin check, 10 MB).
Routes: `POST /me/documents` (multipart field `file`, kinds `id_document|proof_of_address|prospectus|decision|other`; pdf/png/jpg by magic bytes; ≤ 10 MB; stored under `$DATA_DIR/docs/<sha256>`), `GET /documents/{id}` (owner, same-org members, registrar, admin; others 404; `Content-Disposition: attachment`, `nosniff`), `POST /me/kyc {wallet, investorType, residency, taxBps, fullName, documentIds, seriesMints}` (wallet must be one of the user's verified wallets; one open application per user → `409 kyc_pending`), `GET /me/kyc`, `GET /registrar/kyc?status=`, `GET /registrar/kyc/{id}`, `POST /registrar/kyc/{id}/approve` (runs `onboardInvestor` for each series; partial failure leaves status `submitted` with per-series results), `POST /registrar/kyc/{id}/reject {reason}`. Each decision creates a notification row (kind `kyc_decision`) via the store.
- [ ] Tests: foreign document → 404; exe renamed .pdf → 400 `unsupported_type`; approve calls the executor twice per series (fake executor); reject stores the reason.

### Task 804 (glm): KYC pages
**As built by 803:** upload with `boUpload("me/documents", file, kind)` (lib/boClient.ts) → `{document}`; `GET /me/documents`; `GET /me/kyc` → `{application: {…, documents} | null}`; `POST /me/kyc` (codes `wallet_not_linked`, `kyc_pending`); registrar `GET /registrar/kyc?status=`, `GET /registrar/kyc/{id}`, `POST …/approve` → `{ok, status, results:[{series, investor, attestation, signatures, error}]}` (ok:false keeps it under review), `POST …/reject {reason}`; documents download via `/api/bo-get/documents/{id}`.
**Files:** `src/app/(cabinet)/investor/kyc/{page.tsx,KycForm.tsx}`, `src/app/(cabinet)/registrar/kyc/{page.tsx,[id]/page.tsx}`, `messages/*/kyc.json`, `src/mocks/features/kyc.ts`, `e2e/kyc.spec.ts`; nav items (investor "Verification", registrar "KYC queue" with pending count).
- Investor: stepper (wallet linked → documents → details → submitted/decision), document upload with progress, SIMULATED review note. Registrar: queue table, detail with document links, approve (shows signatures with explorer links) / reject with reason.
- [ ] e2e: submit application → registrar approves → status Approved.

### Task 805 (glm): notifications
**Files:** `internal/notify/notify.go(+_test)`, `internal/api/notifications.go(+_test)`, `internal/store/notifications.go`; hook in `internal/ingest/ingest.go` (call `notify.FromEvent(ctx, st, ev)` after an event row is stored — additive); `src/components/shell/NotificationBell.tsx` (in `CabinetShell` top bar, polls `/me/notifications/count` every 30 s), `src/app/(cabinet)/account/notifications/page.tsx`, `messages/*/notify.json`, `src/mocks/features/notify.ts`, `e2e/notifications.spec.ts`.
Write rows only through `Store.Notify(ctx, userID, kind, payload, dedupKey)` (task 803, `internal/store/notify.go`; idempotent per user+dedupKey) — add readers in `internal/store/notifications.go`. KYC decisions already notify (kind `kyc_decision`, dedup `kyc:<id>`). Kinds: `action_announced` (holders of the series), `entitlement_paid` (that holder), `meeting_opened`, `meeting_finalized`, `kyc_decision`, `invite_accepted`. Recipients = users whose verified wallets are holders (investors read model) of the series. Routes: `GET /me/notifications?unread=1&limit=`, `GET /me/notifications/count`, `POST /me/notifications/read {ids?: number[], all?: bool}`. Idempotent per (user, kind, event signature).
- [ ] Tests: replaying the same event creates no duplicate; non-holder gets nothing.

### Task 806 (glm): account page
**Files:** `internal/api/account.go(+_test)`, `src/app/(cabinet)/account/page.tsx` (keeps task 801's wallets section), `messages/*/account.json` (`account.profile`), `e2e/account.spec.ts`.
`PATCH /me {name?, locale?}`, `POST /me/password {current, new}` (wrong current → `400 bad_credentials`; revokes other sessions). Demo users see read-only profile with a note. Locale change also sets `NEXT_LOCALE`.

### Task 807 (glm): issuer organisation, team, documents
**Files:** `internal/api/org.go(+_test)`, `internal/store/org.go`; issuer series scoping middleware `issuerOwnsSeries` applied to `/issuer/series/{mint}/*` and `/issuer/actions/{pda}/*` (admin bypass; demo issuer owns demo-org series; `createSeries` writes `series_settings.org_id`); `src/app/(cabinet)/issuer/{organization,team,documents}/page.tsx`, `src/app/(public)/invite/[token]/page.tsx` + `src/app/api/session/invite/route.ts`, bond page documents list, `messages/*/org.json`, mocks, `e2e/org.spec.ts`.
Routes: `GET/PATCH /org`, `GET /org/members`, `POST /org/invites {email, role: issuer}` → `{url, expiresAt}` (7 days, hashed), `DELETE /org/members/{id}`, `POST /auth/invite/accept {token, name, password}` (creates the user in the org + session), `POST /issuer/series/{mint}/documents {documentId, kind}`, `GET /series/{mint}/documents` (public list).
- [ ] Tests: other org's issuer → 403 `not_your_series`; invite single use.

### Task 808 (glm): investor faucet button and onboarding checklist
`/investor` shows (devnet only) an onboarding checklist: account ✓, wallet linked, KYC approved, test cash received (faucet buttons per test asset from `GET /assets` + `testAssets`), first subscription. Uses task 603's `POST /me/faucet`.

## Plan 9 — Reports (§5.4)

### Task 901 (glm): report builders and endpoints
**Files:** `internal/reports/{statement,tax,holders,payouts}.go(+_test)`, `internal/api/reports.go(+_test)`.
`GET /me/reports/statement?from=&to=&format=csv|json` (all verified wallets of the user), `GET /me/reports/tax?year=&format=` (gross/withheld/net per payout and totals), `GET /registrar/reports/holders/{mint}?format=` (current register: owner, units, type, residency, tax), `GET /issuer/reports/payouts/{actionPda}?format=` (per holder gross/tax/net/principal/status/signature; scoped by `issuerOwnsSeries`). CSV: UTF-8 with BOM, header row, amounts in major units with the asset's decimals, trailing metadata comment lines `# network,…`, `# generated_at,…`.
- [ ] Tests with the brief's numbers: payouts 500/1,250/3,250 gross; tax certificate totals; another user's wallet never appears.

### Task 902 (glm): report pages
`src/app/(cabinet)/investor/reports/page.tsx`, `src/app/(cabinet)/registrar/reports/page.tsx`, issuer action page "Payout report" button; printable view `src/app/(print)/print/[report]/page.tsx` with `@media print` styles and a "Save as PDF" button (`window.print()`); `messages/*/reports.json`; downloads through `/api/bo-get/...`; `e2e/reports.spec.ts`.

## Plan 10 — KASE (§5.5)

### Task 1001 (glm): kase.kz client and API
**Files:** `internal/kase/{client,normalize,cache}.go(+_test)` using fixtures in `internal/kase/testdata/` (task 600), `internal/api/kase.go(+_test)`.
Client: base `https://kase.kz`, paths with trailing slash (`/api/instruments/bonds/{t}/`, `/characteristics/`, `/api/instruments/coupon-payments/{t}/`, `/api/instruments/trade-info/{t}/`, `/api/instruments/last-deals/{t}/`, `/api/news/company/{issuer}/?language=ru|en`), `User-Agent: Qupon/1.0 (+https://qupon.85-192-29-7.sslip.io)`, 5 s timeout, global 1 req/s token bucket, TTLs per §5.5, last good body kept in `kase_cache` and served with `stale: true` on failure. Normalised DTO per spec §5.5 (dates `YYYY-MM-DD`, rates in bps, face in minor units of the bond currency). Routes (`mountKase`, public, cached): `GET /kase/bonds/{ticker}`, `GET /kase/news/{issuer}?lang=`; codes `invalid_ticker`, `kase_not_found`, `kase_unavailable`.
- [ ] Tests: normalise fixtures (TEBNb10); httptest server returning 500 after one good response → stale body; HTML body → `kase_unavailable`; ticker `../x` → 400.

### Task 1002 (glm): KASE in the UI
Issuer wizard "Import from KASE" (ticker → prefill name/face/rate/frequency/dates/day count; side panel compares KASE's coupon schedule with the preview and highlights mismatches), bond page KASE panel for series with `kaseTicker` (price, bid/offer, volume, last trades, issuer news; "Source: kase.kz · fetched HH:MM"; stale/unavailable states), `messages/*/kase.json`, `src/mocks/features/kase.ts` (from the fixtures), `e2e/kase.spec.ts`.

### Task 1003 (glm): schedule check and disclosure package
Registrar action page: "KASE schedule check" card (fixation date vs record date for the period, ✓ / mismatch); `GET /actions/{pda}/disclosure.zip` (notice RU+EN, seev.031, seev.036 per holder, `manifest.json`) and a "Disclosure package" button with "Submit to KASE — SIMULATED" (records an audit row only).

## Plan 11 — Motion (§5.6)

### Task 1101 (lead): motion primitives
`pnpm add motion` in apps/web; `src/lib/motion.ts` (durations 0.12/0.2/0.3 s, ease `[0.2, 0.8, 0.2, 1]`, spring `{type:"spring", stiffness: 420, damping: 32}`); `src/components/motion/{MotionProvider,FadeIn,Stagger,CountUp,Pulse}.tsx` (`LazyMotion features={domAnimation}` + `MotionConfig reducedMotion="user"`); applied to Toast, Dialog, Stepper fill, Badge status pulse, KPI numbers; cabinet `template.tsx` page transition; `e2e/motion.spec.ts` (reduced motion → final state immediately; no layout shift on load).

### Task 1102 (glm): motion across pages
Stagger on series/actions/investors/KYC tables and bond cards; landing hero (grid drift, card float; static on phones and reduced motion); notification bell badge pop; sweep screenshots stable (`reducedMotion: "reduce"` in the sweep project).

### Task 1103 (lead): landing hero v2 (spec §5.8)
Fixed-size hero in EN and RU (same height at 1440/1024/390; clamp() headline; header nav and tagline never wrap), animated background (aurora blobs + grid drift, CSS transforms), lifecycle card that plays a corporate action in a loop (6 segments fill in order, status chip and total/holders count up; pauses when off-screen; reduced motion → final state), `devIndicators: false`.

### Task 1104 (lead): Solana wallet connection UX (spec §5.7)
`components/wallet/{WalletButton,WalletDialog,useWalletChoices}` replacing every `WalletModalProvider`/`setVisible` use; header and top-bar button; detection rules (1 → direct, many → picker, none → install + mobile deep link + view by address); EN/RU; e2e with injected Wallet Standard test wallets (0, 1, 2 wallets).

### Task 1105 (glm): motion polish v2 (spec §5.8)
Press (scale .98) and hover lift on Button/Card links; sliding active indicator in cabinet nav and Tabs (`layoutId`); shimmer Skeleton; Address copy → animated check; toast auto-dismiss progress bar; CountUp re-animates when a polled value changes (old → new). All via `components/motion` primitives and CSS tokens; reduced motion respected; e2e `motion.spec.ts` extended.

### Task 1106 (lead + subagent): UX audit
Screenshot sweep of every page (EN/RU × 1440/390) + checklist (§5.8): layout shift between locales, wrapping, empty/loading/error states, focus, contrast, touch targets, copy. Output `reports/ux-audit.md` and fix tasks `11NN-ux-*.md`.

## Plan 12 — Hardening and launch

### Task 1201 (glm): cross-feature e2e
`e2e/platform.spec.ts` (mock mode): sign-up → link wallet (mock signer) → faucet → KYC → registrar approve → notification → statement CSV; admin: create issuer user in an org → invite accept → issuer sees only own series.

### Task 1202 (flash): sweep extension
Add every new page to `e2e/sweep.spec.ts` (EN/RU × desktop/phone), regenerate `reports/ui/sweep/`.

### Task 1203 (lead): live devnet walk, deploy, docs
Deploy (`ops/deploy-vps.sh`; new env `NETWORK=devnet`, `DATA_DIR`), live walk of the 1201 flow with a real wallet on devnet, `reports/live-v2.md`, README + `docs/02-architecture.md` + `docs/01-product.md` updates, screenshots.

### Task 1204 (flash): OpenAPI for every new route
Both `openapi.yaml` copies; schemas for every DTO above; `make verify` (the spec lint) green.

## Order and dependencies

600 → {601, 701, 702, 801, 802, 1001, 1101} in parallel; 602 ← 601; 603 ← 801; 604 ← 601; 605 ← 600; 703/704/705 ← 701 (705 also 702); 803 ← 801; 804 ← 803; 805 ← 803; 806 ← 801; 807 ← 803; 808 ← 603, 801; 901 ← 801; 902 ← 901; 1002 ← 1001, 602; 1003 ← 1001; 1102 ← 1101; 1201 ← 804, 805, 807, 808, 901; 1202 ← all pages; 1203 ← everything; 1204 ← all Go tasks. Cut line: 606, then the tax certificate part of 901/902.
