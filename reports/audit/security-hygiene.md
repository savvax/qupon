# Security & repo hygiene audit — task 91570

Date: 2026-10-12 (pre-submission, code freeze). Method: full git-history secret scan (gitleaks + manual `git log -p` pattern probes), static review of runtime config and `programs/qupon_bonds`, and a **GET-only** probe of prod (site `https://qupon.85-192-29-7.sslip.io`, API `https://api.85-192-29-7.sslip.io`). No POST/PUT/DELETE was sent, no admin action taken, **0 of the 1 allowed sandbox creations used**. No secret values are reproduced below.

## Findings (most severe first)

### A91570-1 [P0] Submission links point at the still-private repo `github.com/savvax/qupon`
**Where:** `docs/SUBMISSION_FINAL.md:5,50,78,85-91` · `README.md:3,209` (CI badge + `solana-verify verify-from-repo`) · `docs/superpowers/plans/2026-10-06-plan5-kz-general-track.md:21,51,66,126`
**Evidence:** every submission-facing doc links the repo; `docs/superpowers/plans/2026-10-06-plan5-kz-general-track.md:21` records it answering 404 to the GitHub API (= private). Re-checking from this box: `curl -s -o /dev/null -w '%{http_code}' https://api.github.com/repos/savvax/qupon` timed out (egress filter), so not re-verified here. Owner is handling visibility (per task brief).
**Fix:** before submitting, make the repo public (or add `hackathon@colosseum.com` as collaborator) and confirm the API answers 200; no code change.

### A91570-2 [P2] No LICENSE file in the repo
**Where:** repo root.
**Evidence:** `ls LICENSE*` → no match; `git ls-files | grep -ci license` → 0. Plan5 §126 explicitly requires adding an MIT license in the same step as making the repo public.
**Fix:** add `LICENSE` (MIT, "Qupon team") before flipping visibility.

### A91570-3 [P2] 502 error bodies echo internal Anchor/RPC error strings
**Where:** `services/registrar/internal/api/api.go:129` (and every `writeError(w, http.StatusBadGateway, err.Error())` call site, e.g. `/actions/{pda}/notice`, `/actions/{pda}/reconcile`).
**Evidence:** `GET https://api…/actions/11111111111111111111111111111111/notice` → `502 {"code":"http_502","error":"fetch action …: CorporateAction: discriminator mismatch","message":…}` — internal account names and Anchor discriminators surface to clients. No stack traces, file paths or SQL were observed anywhere (Go default `404 page not found` body is clean).
**Fix:** map upstream fetch failures to a generic "chain read failed" message and keep `err.Error()` in the server log only.

### A91570-4 [P2] Header polish: HSTS lacks `includeSubDomains`, no CSP, server tech disclosed
**Where:** Caddy in front of both site and API.
**Evidence:** `curl -sI` on both hosts → `strict-transport-security: max-age=31536000` (no `includeSubDomains`/`preload`), no `content-security-policy`, and `via: 1.1 Caddy`. Present and correct on both: `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy: camera=(), microphone=(), geolocation=()`. CORS is read-only by design: any origin echoed for GET/HEAD only, no `Allow-Credentials`, writes get no CORS headers (verified with an `OPTIONS` preflight for POST from `https://evil.example` → allowed methods `GET, HEAD`).
**Fix:** add `includeSubDomains` to HSTS and a minimal CSP in the Caddy site block; drop the `Via` header.

### A91570-5 [P2] `GET /approvals` is unauthenticated
**Where:** `services/registrar/internal/api/api.go:255` (`r.Get("/approvals", listApprovals(st))`).
**Evidence:** `curl https://api…/approvals` → `200 {"approvals":[]}` with no session cookie (all 18 other admin/registrar/issuer/me routes probed returned 401). The queue holds scheduled corporate actions — data that is public on-chain once announced, so exposure is limited; flagging for the record.
**Fix:** if the queue should be back-office only, wrap it in `requireRole(deps.Auth, "registrar")`; otherwise document it as public.

## Verified clean (no finding)

- **Secrets, full history:** `make secrets-scan` → gitleaks 8.30.1: "719 commits scanned … no leaks found". Manual probes (`git log --all -G/-S --name-only`, values never printed): no 64-number keypair arrays, no 87/88-char base58 secret keys, no `ADMIN_TOKEN=`/`secretKey` values ever committed, no keyed RPC URLs (`api-key=`/`helius` hits are `REPLACE_ME` placeholders in `.env.example`, docs, prompts and test fixtures). The only env-like files ever added are `.env.example` and `services/registrar/.env.example` (placeholders); no keypair JSON or `id.json` ever tracked.
- **Devnet-only runtime:** default `RPC_URL=https://api.devnet.solana.com` (`internal/config/config.go:51`); live `GET /network` → `{"network":"devnet","mainnet":false,"programId":"QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd"}` matching `declare_id!` (`programs/qupon_bonds/src/lib.rs:16`) and `config/devnet.json`. Sandbox wired only under `!profile.Mainnet` (`cmd/registrar/main.go:224`) with rate limits 3/hour, 30/day; `mainnetGuard` in the middleware chain (`internal/api/api.go:76`). The mainnet *profile* (`config/mainnet-beta.json`, `ops/deploy-mainnet.sh`) is documented, dry-run by default and not deployed.
- **AuthZ on prod:** all probed admin/registrar/issuer/user GET routes (18) returned 401 without a session: `/registrar/audit`, `/registrar/kyc`, `/registrar/reports/holders/{mint}`, `/issuer/reports/payouts/{pda}`, `/admin/system|audit|users|organizations|series|assets|custodian`, `/me`, `/me/wallets`, `/me/kyc`, `/me/notifications`, `/org`, `/me/reports/statement`.
- **Program vs `docs/SECURITY_NOTES.md`:** no `unwrap()`/`expect()` outside `#[cfg(test)]` (all hits in `src/clock.rs` tests); `require_operator` (`src/utils.rs:27`) and `has_one`/constraints present (78 sites across instructions); `announce_action` selects expected signer by action kind; money math in u128/checked ops (raw arithmetic only on proven-in-range civil-date fields, as documented); 29 `emit!` sites; `declare_id!` = deployed devnet id. All 30 instructions have LiteSVM coverage including failure paths (`assert_err` used 114× across 19 test files; the hook `execute` entry has a dedicated rejection test `direct_execute_and_transfers_without_extras_are_rejected`, `tests/hook.rs:436`). No instruction is missing a failure-path test.
- **Web client bundle:** `NEXT_PUBLIC_*` only ever holds keyless public devnet RPC/URLs with explicit comments against keyed URLs (`apps/web/src/components/Providers.tsx:15`, `ProofView.tsx:30`).

## Summary
1. Secrets: full-history scan clean (gitleaks + manual); placeholders only, no keypairs/env ever committed.
2. Runtime is devnet-only and live-verified (`/network` → devnet, correct program id); mainnet profile exists but guarded and not deployed.
3. Prod authZ holds: every protected route 401s unauthenticated; headers solid; CORS read-only without credentials.
4. Program matches `docs/SECURITY_NOTES.md` on every listed mitigation; all 30 instructions have failure-path tests.
5. One P0 (repo still private — owner handling), four P2 polish items (LICENSE, 502 internals, HSTS/CSP, public `/approvals`).
