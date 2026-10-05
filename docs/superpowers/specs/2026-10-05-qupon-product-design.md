# Qupon — from prototype to product (design spec)

Date: 2026-10-05 · Owner: lead · Deadline: submission 2026-10-12 20:00 Almaty (hard 2026-10-13 11:59) · Devnet only.

## 1. Goal and success criteria

Turn the working prototype (console + investor portal + Go registrar API, live at https://qupon.85-192-29-7.sslip.io)
into a product a judge, an issuer, a registrar and an investor can use end to end in the browser, with a design that
reads as "KASE, but better".

Success = on the deployed site, without a terminal:
1. a demo issuer creates a bond series, announces a coupon, funds the escrow, calls a bondholder meeting;
2. a demo registrar onboards an investor (KYC attestation on SAS + registration), runs record date → snapshot → pay →
   complete, downloads ISO 20022 and the KASE notice;
3. an investor (own wallet, or the labelled demo investor) subscribes at par, votes, and sees received and upcoming
   payments with transaction links;
4. every screen in EN and RU, usable on a phone, built only from the design-system tokens below;
5. `make verify` green, Playwright e2e for the three journeys green against devnet, CI green.

## 2. Decisions (human, 2026-10-05)

| Topic | Decision |
|---|---|
| Roles in the UI | All three, full: issuer, registrar, investor |
| Sign-in | Hybrid: issuer and registrar are back-office users (login, keys server-side, like an HSM at a depository); investors sign with their own wallet; one-click demo sign-in per role for judges |
| Languages | EN (default) + RU |
| Visual direction | "KASE, but better" — design system v1 (section 5) |
| Implementation | Approach A: Go registrar = back-office core (auth, roles, all writes through the existing CLI executor); Next.js = UI |

## 3. Information architecture

Public (no sign-in)
- `/` landing: hero, how it works (record date → entitlements → escrow → payout → ISO 20022), the three scenarios,
  live devnet stats, for issuers / for investors, implemented-vs-simulated table, links (technical overview, demo
  report, GitHub).
- `/bonds` bond board (active series: coupon, next date, status); closed series collapsed.
- `/bonds/[mint]` public bond page: terms, coupon schedule, corporate-action history with explorer links.
- `/login`: email + password, plus "Sign in as demo issuer / demo registrar / demo investor".

Issuer cabinet `/issuer` (role `issuer`)
- Dashboard: my series, upcoming payments, escrow due (required vs funded), items waiting for me.
- New series wizard: terms → schedule preview (computed with `crates/entitlement` rules via the TS lib) → review →
  issue on-chain (mint + `init_series`).
- Series page: terms, schedule, holders count, actions; buttons: announce coupon / redemption / early call;
  call bondholder meeting (proposed rate, record date, voting end); fund escrow for an open action.
- Documents: KASE notices, ISO files per action.

Registrar back-office `/registrar` (role `registrar`)
- Dashboard: action pipeline by status, alerts (record date reached, underfunded, failed step).
- Investors & KYC: list per series; onboard (SAS attestation → `register_investor`); suspend / reinstate.
- Corporate actions: the existing step-by-step action page (redesigned), reconcile, ISO 20022, KASE notice.
- Activity: on-chain events + operator audit trail (who, what, when, tx).
- Autopilot: scheduler approvals queue (task 024 endpoints).

Investor cabinet `/investor` (wallet, or demo investor)
- Portfolio: face value, received and upcoming payments (each with tx), entitlements history.
- Primary placement (DvP at par), meetings (vote), statements (seev.036 per payout), KYC status (SAS attestation).
- Demo investor (judges without Phantom): server-signed with the investor3 demo keypair, labelled "demo custodial
  wallet" on every screen.

Everywhere: EN/RU switch, responsive (≥ 360 px), toasts with explorer links, loading / empty / error states, 404.

## 4. Architecture and data flow

```
browser ──(same origin: qupon.<host>)──▶ Next.js (UI, server components, route handlers)
   │  wallet-signed investor txs (subscribe, vote) go straight to Solana RPC
   │
   └─ cookie qupon_session (httpOnly, Secure, SameSite=Lax) — only Next sees it
Next.js server ──(Authorization: Bearer <session>)──▶ Go registrar API ──▶ qupon CLI executor ──▶ Solana devnet
                                                        │   └─ keys: registrar, issuer, paying agent, KYC provider,
                                                        │      demo investor (server-side only, mode 600)
                                                        └─ SQLite: users, sessions, audit, series registry, activity
```

Go registrar (new or changed):
- `internal/auth`: `users` (id, email, name, role `issuer|registrar|investor_demo|admin`, signer role, bcrypt hash,
  is_demo), `sessions` (sha256(token), user, expires_at; 12 h), login with rate limit (5/min/IP), logout, `GET /me`.
  Demo users seeded from config; their passwords are never shown — demo sign-in uses `POST /auth/demo {role}` which
  only works when `DEMO_LOGIN=1`.
- RBAC middleware on every write route; reads stay public. `ADVANCE_TOKEN` is retired in favour of sessions.
- Audit log: one row per write (user, role, route, params digest, result, tx signatures).
- Writable executor config: `/data/qupon-config.json` = base `config/devnet.json` + `series` table (name, mint, terms),
  regenerated before each CLI run; replaces the read-only bind mount and `series-config.ts` push.
- Write endpoints (JSON in, `{ok, step, signatures[], status}` out; errors `{error, code, onchainError?}`):

| Route | Role | CLI |
|---|---|---|
| `POST /issuer/series` | issuer | new `series:create` (mint + `init_series`, terms as flags; registers the series in the DB) |
| `POST /issuer/series/{mint}/actions` | issuer | `action:announce` (INTR / REDM / MCAL, dates, call date) |
| `POST /issuer/series/{mint}/meetings` | issuer | `meeting:announce` |
| `POST /issuer/actions/{pda}/fund` | issuer | `action:fund` |
| `POST /registrar/investors` | registrar | `kyc:attest` then `investor:register` |
| `POST /registrar/investors/{series}/{owner}/suspend` · `/reinstate` | registrar | `investor:suspend` / reinstate |
| `POST /registrar/actions/{pda}/advance` | registrar | existing advance (strike → … → complete, retire, close, meeting finalize/apply) |
| `POST /demo/investor/subscribe` · `/vote` | investor_demo | `subscribe` / `vote` with the demo investor key |

Next.js: route handlers under `/api/session/*` (login, demo, logout) set/clear the cookie; `/api/bo/*` forwards
writes with the bearer token (validated paths, JSON only, Origin check). Public reads keep calling the API directly.

CLI additions: `series:create` (generalises `scripts/create-bond-mint.ts` + `series:init`) and `investor:reinstate`
(the program has `reinstate_investor`; the CLI only has `investor:suspend`). Program unchanged.

## 5. Design system (implemented in code)

Tokens (Tailwind v4 `@theme`; approved mockup: `.superpowers/brainstorm/59710-1791201518/content/design-system-v1.html`, local only):
- Green (brand, KASE #028a29 = 600): 50 #eef9f1 · 100 #d6f0de · 200 #ade0bd · 300 #7cca96 · 400 #45ae6a ·
  500 #179647 · 600 #028a29 · 700 #02701f · 800 #035a1c · 900 #04431a. Accent on dark: #2ec05f.
- Petrol (dark surfaces): 50 #eef6f7 · 100 #d4e8eb · 300 #7fb0b8 · 500 #1f6f7a · 700 #0f4552 · 800 #0b2f3a · 900 #071d25.
- Neutral: 0 #fff · 50 #f6f8f7 · 100 #eef2f0 · 200 #e2e8e5 · 300 #cbd4cf · 400 #9aa7a0 · 500 #6b7972 · 600 #4c5953 ·
  700 #34403a · 900 #121a16.
- Semantic: warning #fff6e5/#8a5300/#f5d9a1, danger #fdeeee/#b4171d/#f3c2c3, info = petrol.
- Spacing on a 4 px grid: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Radii 8 (sm controls) · 10 (buttons, inputs) · 16 (cards) · 24 (hero).
- Type: Manrope (next/font, latin + cyrillic) — display 40/800, h1 28/700, h2 20/700, body 14/500, caption 11/700
  uppercase .06em; amounts always tabular figures, space as thousands separator, currency after the amount.
- Buttons: sm 32 / md 40 / lg 48; variants primary, secondary, ghost, destructive, primary-on-dark, secondary-on-dark;
  states hover, pressed, focus ring (2 px white + 2 px green-400), loading (spinner + verb), disabled.

Components (`apps/web/src/components/ui`, Radix primitives where a11y matters): Button, IconButton, Badge, Card,
Kpi, Stepper, DataTable (responsive: cards under 640 px), Tabs, Dialog, Drawer, Select, TextField, DateField,
AmountField, Toast (with tx link), EmptyState, Skeleton, Amount, Address (copy + explorer), LocaleSwitch,
PublicShell (top nav), CabinetShell (sidebar + topbar, collapses to bottom nav on mobile).

i18n: `next-intl`, messages `en.json` / `ru.json`, locale cookie, default EN; amounts and dates formatted by locale.

## 6. Errors, security, operations

- Every write: pending toast → success toast with explorer link, or inline error with the on-chain error name and a
  localized explanation (existing `KycAttestationInvalid`, `TooEarly`, … map). The page polls until the status moves
  (devnet reads lag up to ~20 s).
- Security: RBAC in Go only; bcrypt (cost 12); session tokens 32 random bytes, stored hashed; login rate limit;
  Origin check + SameSite=Lax on cookie routes; demo login gated by `DEMO_LOGIN`; secrets only on the server; audit
  log for every write; CORS stays read-only.
- Demo data: `make demo-reset` creates a fresh issuer series with registered investors so the demo always starts
  clean; deploy script unchanged except the writable config.

## 7. Testing

- Go: auth (login, rate limit, session expiry, demo gate), RBAC matrix per route, each write endpoint with the fake
  CLI (argv + audit row), config regeneration.
- TS: `series:create` arg parsing; i18n key parity test (every EN key has RU); component tests for Button states,
  Amount formatting (EN/RU), DataTable responsive switch.
- Playwright e2e against devnet + deployed API: (1) demo issuer creates series → announces coupon → funds;
  (2) demo registrar onboards investor → runs the coupon to Completed; (3) demo investor votes. Plus visual
  screenshots of every page in EN and RU, desktop and 390 px.

## 8. Delivery (orchestrated: lead + GLM workers)

| Phase | Dates | Content | Owner |
|---|---|---|---|
| 1 | Oct 5–6 | Tokens, Manrope, UI components, PublicShell/CabinetShell, landing, `/bonds`, `/bonds/[mint]`, i18n scaffold | lead (design-critical) + GLM (components with tests) |
| 2 | Oct 6–8 | Go auth + sessions + RBAC + audit, writable config, write endpoints, `series:create`, demo seed | lead (security) + GLM (endpoints with tests) |
| 3 | Oct 8–10 | Issuer cabinet + wizard, registrar back-office, investor cabinet (wallet + demo), RU translations | lead + GLM |
| 4 | Oct 10–11 | e2e, mobile pass, visual QA, deploy, `make demo-reset`, README/overview/submission refresh | lead |

Gate: Oct 11 22:00 — all journeys pass on the deployed site in EN and RU; otherwise ship what passes and hide the rest.

## 9. Out of scope

Mainnet; a real KYC provider (SAS attestation stays, provider simulated); Squads multisig (040 → roadmap); password
reset and self-sign-up for back-office users (admin seeds users); email or push notifications; Kazakh language.
