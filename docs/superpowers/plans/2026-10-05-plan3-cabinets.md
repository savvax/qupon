# Plan 3 — Cabinets (sign-in, issuer, registrar, investor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The three roles work entirely in the browser on the new design: sign-in (incl. one-click demo), issuer cabinet, registrar back-office (with the redesigned corporate-action screen), investor cabinet (wallet or demo), and the legacy pages are retired.

**Architecture:** Next.js keeps the session token in an httpOnly cookie and talks to the Go API server-to-server with `Authorization: Bearer`. Server components read via `boFetch`; client-side writes go through one validated proxy route `/api/bo/[...path]`. Cabinet pages use `CabinetShell` (Plan 1 Task 5) and the existing domain helpers (`lib/actionFlow.ts`, `lib/portal.ts`).

**Tech Stack:** Next.js 15 app router, next-intl, Plan 1 components, Plan 2 API, @solana/kit (investor wallet signing via `lib/walletSigner.ts`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-05-qupon-product-design.md` (§1 success criteria, §3 IA, §4 data flow, §6).

## Global Constraints

- The session token never reaches client JS: cookie `qupon_session` (httpOnly, Secure in production, SameSite=Lax, Path=/, Max-Age 43200).
- Every cabinet page server-side checks the role and redirects to `/login?next=<path>` (401) or shows a 403 EmptyState (wrong role).
- Writes from the browser only via `POST /api/bo/<allowed path>`; the proxy accepts JSON only, checks `Origin` equals the site origin, forwards the bearer, never forwards cookies to the API.
- Every write shows a pending toast → success toast with explorer link(s) or an inline error with the on-chain name explained via `ERROR_EXPLANATIONS` (EN) / `errors.*` messages (RU).
- All strings via next-intl (EN + RU); amounts via `<Amount>`; addresses via `<Address>`; statuses via `<Badge status>`.
- Demo identities are always visibly labelled (amber "DEMO" pill in the topbar; investor demo pages say "demo custodial wallet").
- `make verify` + the task's Playwright spec green after each task.

## Review Focus

1. Session expires while a cabinet page is open, then the user clicks a write button → the proxy gets 401 → the UI shows "Session expired — sign in again" with a link to `/login?next=…`, not a generic error (Task 1 proxy test + Task 2 e2e).
2. Double-submit of a write form (double click "Create series") → the second click is ignored while the first is pending (buttons `loading`) and the API's own dedup (series name) protects the chain (Task 2 e2e).
3. A registrar opens an action whose series is not in the registry (created outside the app) → page renders read-only with a notice, step buttons hidden (Task 4 test).
4. Investor without a wallet and without demo session visits `/investor` → clear choice "Connect wallet" / "Try the demo investor", no crash (Task 6 e2e).
5. RU locale on every cabinet page has no untranslated keys and no layout overflow at 390 px (Task 7 e2e sweep).

---

## File Structure

```
apps/web/src/
  lib/session.ts            # server: getSession(), requireRole(), cookie helpers
  lib/bo.ts                 # server: boFetch(path, init) with bearer
  lib/boClient.ts           # client: boPost(path, body) → typed result | BoError; toast wiring helper runWrite()
  app/api/session/{login,demo,logout}/route.ts
  app/api/bo/[...path]/route.ts
  app/(public)/login/page.tsx + LoginForm.tsx
  app/(cabinet)/layout.tsx                    # loads session, renders CabinetShell
  app/(cabinet)/issuer/…                      # Task 2
  app/(cabinet)/registrar/…                   # Tasks 3–5
  app/(cabinet)/investor/…                    # Task 6
  components/forms/{FormField,DateTimeField}.tsx
  app/(legacy)/…                              # deleted in Task 7 (redirects in next.config)
```

---

### Task 1: Session plumbing, `/login`, write proxy; deploy plans 2+3.1

**Files:**
- Create: `src/app/(public)/forbidden/page.tsx`, `src/lib/session.ts`, `src/lib/bo.ts`, `src/lib/boClient.ts`, `src/lib/boClient.test.ts`, `src/app/api/session/{login,demo,logout}/route.ts`, `src/app/api/bo/[...path]/route.ts`, `src/app/api/bo/allowlist.ts`, `src/app/api/bo/allowlist.test.ts`, `src/app/(public)/login/{page,LoginForm}.tsx`
- Modify: `src/app/(legacy)/actions/[pda]/AdvanceButton.tsx` (call `/api/bo/registrar/actions/{pda}/advance`), delete `src/app/api/advance/[pda]/route.ts`, `deploy/vps/compose.yml` + `ops/deploy-vps.sh` (web gets `API_INTERNAL_URL=http://registrar:8080`; registrar gets `DEMO_LOGIN=1`), messages (`login.*`, `errors.*`)

**Interfaces:**
- Consumes: Go `POST /auth/login|/auth/demo|/auth/logout`, `GET /me` (Plan 2 Task 3).
- Produces:
  - `type SessionUser = { id: number; email: string; name: string; role: "issuer"|"registrar"|"investor_demo"|"admin"; isDemo: boolean }`
  - `getSession(): Promise<SessionUser | null>` (reads cookie, calls `GET /me` via `boFetch`, null on 401)
  - `requireRole(path: string, ...roles: SessionUser["role"][]): Promise<SessionUser>` (redirects to `/login?next=<path>` when signed out, to `/forbidden?role=<role>` for a wrong role)
  - `boFetch<T>(path: string, init?: RequestInit): Promise<T>` (server only; base `API_INTERNAL_URL ?? NEXT_PUBLIC_API_URL`; throws `BoError {status, code, message, onchainError?}`)
  - `isAllowedWrite(path: string): boolean` — allowlist `^(issuer|registrar|demo)/[A-Za-z0-9/_-]{1,200}$`, no `..`, no `//`
  - `boPost<T>(path: string, body: unknown): Promise<T>` (client; throws `BoError`)
  - `runWrite<T>(opts: { pending: string; success: (r: T) => string; call: () => Promise<T>; txs?: (r: T) => string[] }): Promise<T | null>` — toast pending → success (first tx as link) / error (explained); on 401 shows the session-expired toast with a sign-in link
  - Cookie name `qupon_session`

- [ ] **Step 1: failing tests**

```ts
// src/app/api/bo/allowlist.test.ts
import { describe, expect, it } from "vitest";
import { isAllowedWrite } from "./allowlist";
describe("isAllowedWrite", () => {
  it.each(["issuer/series", "registrar/actions/9kcu/advance", "demo/investor/vote", "registrar/investors/M1/O1/suspend"])("allows %s", (p) => {
    expect(isAllowedWrite(p)).toBe(true);
  });
  it.each(["auth/login", "issuer/../auth/demo", "registrar//x", "", "issuer", "approvals/1/approve", "issuer/series?x=1"])("rejects %s", (p) => {
    expect(isAllowedWrite(p)).toBe(false);
  });
});
```

```ts
// src/lib/boClient.test.ts
import { describe, expect, it } from "vitest";
import { explainBoError } from "./boClient";
describe("explainBoError", () => {
  it("names the on-chain error and explains it", () => {
    expect(explainBoError({ status: 409, code: "onchain", message: "x", onchainError: "TooEarly" })).toMatch(/^TooEarly — /);
  });
  it("maps 401 to session expired", () => {
    expect(explainBoError({ status: 401, code: "unauthenticated", message: "sign in required" })).toMatch(/session/i);
  });
  it("falls back to the API message", () => {
    expect(explainBoError({ status: 400, code: "invalid_params", message: "isin must be 12 characters" })).toBe("isin must be 12 characters");
  });
});
```

- [ ] **Step 2: run** `pnpm -C apps/web vitest run src/app/api/bo src/lib/boClient.test.ts` → FAIL
- [ ] **Step 3: implement**

```ts
// src/app/api/bo/allowlist.ts
/** Paths the browser may POST through /api/bo — back-office writes only (auth routes have their own handlers). */
export function isAllowedWrite(path: string): boolean {
  return /^(issuer|registrar|demo)\/[A-Za-z0-9/_-]{1,200}$/.test(path) && !path.includes("..") && !path.includes("//");
}
```

```ts
// src/app/api/bo/[...path]/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { isAllowedWrite } from "../allowlist";
import { SESSION_COOKIE, apiBase } from "@/lib/session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  if (!isAllowedWrite(path)) return NextResponse.json({ error: "not allowed", code: "forbidden_path" }, { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "bad origin", code: "bad_origin" }, { status: 403 });
  if (!req.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON only", code: "bad_content_type" }, { status: 415 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "sign in required", code: "unauthenticated" }, { status: 401 });
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: await req.text() });
  } catch (e) {
    return NextResponse.json({ error: `registrar API unreachable: ${e instanceof Error ? e.message : String(e)}`, code: "upstream" }, { status: 502 });
  }
  return new NextResponse(res.body, { status: res.status, headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" } });
}
```

```ts
// src/lib/session.ts
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
export const SESSION_COOKIE = "qupon_session";
export type SessionUser = { id: number; email: string; name: string; role: "issuer" | "registrar" | "investor_demo" | "admin"; isDemo: boolean };
export function apiBase(): string {
  return process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:8080";
}
export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const res = await fetch(`${apiBase()}/me`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) return null;
  return ((await res.json()) as { user: SessionUser }).user;
}
export async function requireRole(path: string, ...roles: SessionUser["role"][]): Promise<SessionUser> {
  const u = await getSession();
  if (!u) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!roles.includes(u.role) && u.role !== "admin") redirect(`/forbidden?role=${u.role}`);
  return u;
}
export const sessionCookie = (token: string) => ({ name: SESSION_COOKIE, value: token, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 12 });
```

`session/login` and `session/demo` route handlers: POST JSON to Go (`/auth/login` / `/auth/demo`), on 200 set `sessionCookie(token)` and return `{user}` (never the token); propagate 401/403/429 bodies. `session/logout`: POST Go `/auth/logout` with bearer, delete cookie, 204. `bo.ts`: `boFetch` = fetch with bearer from cookie, `cache: "no-store"`, parse error body into `BoError`. `boClient.ts`: `boPost`, `explainBoError` (uses `ERROR_EXPLANATIONS` from `lib/actionFlow.ts`; 401 → "Your session expired — sign in again."), `runWrite` using `toast` (Plan 1 Task 3).

`/login` page: two columns ≥ 1024 px (left: form card "Sign in to the back office" with email, password, primary submit, error line; right: "Try the demo" with three role cards — Issuer / Registrar / Investor — each a secondary button posting `/api/session/demo {role}` then `router.push(next ?? roleHome)`; role homes `/issuer`, `/registrar`, `/investor`). Mobile: stacked, demo first. `/forbidden`: EmptyState "This area is for another role" + sign-out button.

- [ ] **Step 4: run** tests → PASS; Playwright `e2e/login.spec.ts` against a local Go API with `DEMO_LOGIN=1`: demo registrar button → lands on `/registrar` (temporary placeholder page that prints the user from `requireRole`), cookie is httpOnly (`document.cookie` lacks `qupon_session`), `/api/bo/auth/login` POST → 403.
- [ ] **Step 5: deploy** (first deploy of Plan 2): `ops/deploy-vps.sh` → on the live site demo sign-in works; legacy console advance works for the demo registrar.
- [ ] **Step 6: commit** `feat(web): sessions, sign-in page, back-office write proxy; deploy back-office API`

---

### Task 2: Issuer cabinet

**Files:**
- Create: `src/app/(cabinet)/layout.tsx`, `src/app/(cabinet)/issuer/{page,series/page,series/new/page,series/[mint]/page}.tsx`, `src/app/(cabinet)/issuer/_components/{NewSeriesWizard,AnnounceDialog,MeetingDialog,FundButton,SchedulePreview}.tsx`, `src/lib/schedulePreview.ts` (+ test), `e2e/issuer.spec.ts`
- Modify: messages (`issuer.*`)

**Interfaces:**
- Consumes: `requireRole`, `boFetch`, `runWrite`/`boPost`, Plan 1 components, `listSeries/getSeries/getSchedule/listActions`, Go `/issuer/*`.
- Produces:
  - `(cabinet)/layout.tsx`: `const u = await getSession()`; nav by role: issuer → Dashboard `/issuer`, Series `/issuer/series`, New series `/issuer/series/new`; registrar → Dashboard, Actions, Investors, Activity, Autopilot; investor_demo → Portfolio, Placement, Meetings, Statements.
  - `schedulePreview(terms: { faceMinor: bigint; rateBps: number; frequency: 1|2|4|12; dayCount: "THIRTY_360"|"ACT_365"; issueDate: string; maturityDate: string }): { n: number; periodStart: string; periodEnd: string; perUnitMinor: bigint }[]` — 30E/360 = face × rate / 10000 / frequency, rounded half-up; ACT/365 = face × rate × days / (10000 × 365) half-up; last row's period ends at maturity.

- [ ] **Step 1: failing test**

```ts
// src/lib/schedulePreview.test.ts
import { describe, expect, it } from "vitest";
import { schedulePreview } from "./schedulePreview";
describe("schedulePreview", () => {
  it("brief: 1 000 KZT, 10%, semi-annual, 2 years → 4 coupons of 50.00", () => {
    const rows = schedulePreview({ faceMinor: 100000n, rateBps: 1000, frequency: 2, dayCount: "THIRTY_360", issueDate: "2026-07-03", maturityDate: "2028-07-03" });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.perUnitMinor === 5000n)).toBe(true);
    expect(rows[3]?.periodEnd).toBe("2028-07-03");
  });
  it("end-of-month dates clamp (Aug 31 + 6 months = Feb 28)", () => {
    const rows = schedulePreview({ faceMinor: 100000n, rateBps: 1000, frequency: 2, dayCount: "THIRTY_360", issueDate: "2026-08-31", maturityDate: "2027-08-31" });
    expect(rows[0]?.periodEnd).toBe("2027-02-28");
  });
});
```

- [ ] **Step 2–3:** run → FAIL; implement `schedulePreview` (period ends = `addMonths(issueDate, k × 12/frequency)` clamped to month end, computed from issueDate each time — never by stepping, matching `crates/entitlement` `Ymd::add_months`).
- [ ] **Step 4: pages**
  - Dashboard: Kpis (my series, next payment date + amount, escrow due); "Needs your action" list (actions in `SnapshotComplete` without full escrow → Fund button; meetings `Finalized` approved → link to registrar view); latest actions table.
  - Series list: DataTable of `listSeries()` filtered by `series.issuer === process.env.ISSUER_PUBKEY` when that server env is set (the deploy sets it to the demo issuer pubkey), otherwise all series; active first, closed collapsed (same rule as the public board).
  - New series wizard (3 steps in one page with a Stepper on top): ① Terms form (name, ISIN, face (₸ or USDC by cash select), coupon %, frequency select, day count select, issue & maturity dates, quorum/approval with defaults) with inline validation identical to Plan 2 Task 5 rules; ② Schedule preview table from `schedulePreview` + totals; ③ Review card + "Issue on Solana" primary (runWrite → `POST /api/bo/issuer/series`) → success screen with mint `<Address>`, signatures list, buttons "Open series" / "Onboard investors" (link to registrar).
  - Series detail: header (ticker, ISIN, Badge, mint Address), Kpis, Tabs: Schedule · Corporate actions · Holders; header actions: "Announce coupon / redemption / early call" (AnnounceDialog: kind radio, record & payment date-time fields with Almaty TZ hint, call date for MCAL, defaults from the next schedule row), "Call bondholder meeting" (MeetingDialog: new rate %, record date, voting end), and per-action "Fund escrow" (FundButton → `POST /api/bo/issuer/actions/{pda}/fund`).
- [ ] **Step 5:** `e2e/issuer.spec.ts` (local Go API with fake CLI is not enough for chain reads — run against the deployed site with `E2E_BASE_URL`): demo issuer → New series with a unique name `E2E-<epoch36>` → success shows a mint; double-click on "Issue on Solana" sends one request (count `page.on("request")` for `/api/bo/issuer/series` = 1); announce coupon on that series → action appears in the Corporate actions tab with Badge "Announced".
- [ ] **Step 6: commit** `feat(web): issuer cabinet — dashboard, series, new-series wizard, announce, meeting, fund`

---

### Task 3: Registrar back-office shell, dashboard, investors & KYC

**Files:**
- Create: `src/app/(cabinet)/registrar/{page,investors/page}.tsx`, `src/app/(cabinet)/registrar/_components/{Pipeline,OnboardDialog,InvestorRowActions}.tsx`, `e2e/registrar-investors.spec.ts`
- Modify: messages (`registrar.*`)

**Interfaces:**
- Consumes: `requireRole("…","registrar")`, `listSeries`, `listInvestors(mint)`, `listActions(mint)`, Go `POST /registrar/investors`, `/registrar/investors/{mint}/{owner}/suspend|reinstate`.
- Produces: pipeline columns `Announced → Record struck → Snapshot complete → Funded → Settling → Completed` with action cards (series ticker, kind badge, record date, link `/registrar/actions/{pda}`); alerts: record date passed but still `Announced`; `SnapshotComplete` with escrow < required; any `Cancelled`.

- [ ] **Step 1:** Dashboard: Kpis (active series, open actions, investors, payouts this month); Pipeline (horizontal scroll on mobile); alerts list.
- [ ] **Step 2:** Investors page: series Select → DataTable (owner Address, units, type, residency, tax %, KYC attestation Address (`kycRef`), status Badge, row actions Suspend/Reinstate with a confirm Dialog); "Onboard investor" primary → OnboardDialog (wallet address with base58 validation, type, residency, tax bps, attestation validity days) → runWrite `POST /api/bo/registrar/investors` → toast lists two txs (attestation, registration).
- [ ] **Step 3:** e2e: demo registrar onboards a fresh random wallet (generate with `@solana/kit` `generateKeyPairSigner` in the test) into the E2E series from Task 2 → row appears with Badge Active; suspend → Badge Suspended; reinstate → Active.
- [ ] **Step 4: commit** `feat(web): registrar dashboard and investor onboarding (SAS KYC + registration)`

---

### Task 4: Registrar corporate-action screen (redesign of the legacy action page)

**Files:**
- Create: `src/app/(cabinet)/registrar/actions/{page,[pda]/page}.tsx`, `src/app/(cabinet)/registrar/actions/[pda]/_components/{StepButton,EntitlementsTable,FundingPanel,ReconcilePanel,DownloadsPanel,NoticePanel,MeetingPanel}.tsx`, `e2e/registrar-action.spec.ts`

**Interfaces:**
- Consumes: `getAction`, `listEntitlements`, `listActivity`, `getReconcile`, `getNoticeText`, `seev031Url/seev036ZipUrl/seev036Url`, `buildTimeline`, `nextStep`, `paidTxByOwner`, `ERROR_EXPLANATIONS` (all existing), `Stepper`, `Kpi`, `DataTable`, `runWrite`, Go `POST /registrar/actions/{pda}/advance`.
- Produces: the judges' screen — same behaviour as the legacy page (refresh until the status moves, ≤ 60 s; batch tx links; notice 409 text) in the new design: header (breadcrumb Series › Action, title "Coupon INTR #1", kind Badge, status Badge, primary StepButton on the right), Stepper from `buildTimeline`, 4 Kpis (per bond, escrow/required, holders, record date), two columns ≥ 1024 px: left EntitlementsTable (owner, units, gross, tax, net, principal, status, paid tx), right FundingPanel + ReconcilePanel + DownloadsPanel + NoticePanel (EN/RU tabs, copy); MeetingPanel for BMET (proposal old → new rate, tally bars, quorum/approval thresholds, countdown).
- If `GET /series/{mint}` works but the series is not in the executor registry (advance returns 404 `unknown_series`), render read-only with an info banner and no StepButton.

- [ ] **Step 1:** port logic from `src/app/(legacy)/actions/[pda]/page.tsx` + `AdvanceButton.tsx` into the new components (keep the polling: refresh every 2.5 s up to 24 times, stop when `status` changes).
- [ ] **Step 2:** actions list page `/registrar/actions` (filters: status Tabs; DataTable rows → detail).
- [ ] **Step 3:** e2e (deployed site, demo registrar): open the E2E series' announced coupon → click through Strike → … → Complete, waiting for each status change (≤ 60 s each), assert every Stepper step done and 3 Paid rows; the notice tab shows "has paid".
- [ ] **Step 4: commit** `feat(web): registrar corporate-action screen in the new design`

---

### Task 5: Registrar activity, audit, autopilot approvals

**Files:**
- Create: `src/app/(cabinet)/registrar/{activity,autopilot}/page.tsx`

**Interfaces:**
- Consumes: `listActivity`, Go `GET /registrar/audit`, `GET /approvals`, `POST /approvals/{id}/approve` (add `approvals` to the proxy allowlist as `registrar/approvals/{id}/approve` alias — add the alias route in Go: `POST /registrar/approvals/{id}/approve` → existing handler under `requireRole("registrar")`).
- [ ] **Step 1:** Activity: Tabs On-chain (events with kind Badge, series, tx Address, time) · Operator audit (user, role, route, ok Badge, signatures).
- [ ] **Step 2:** Autopilot: pending approvals DataTable (series, action, step, argv preview) with Approve buttons (runWrite) and an "executed" tab.
- [ ] **Step 3:** e2e: activity lists ≥ 1 event; audit shows the onboarding from Task 3.
- [ ] **Step 4: commit** `feat(web): registrar activity, audit trail and autopilot approvals`

---

### Task 6: Investor cabinet (wallet + demo)

**Files:**
- Create: `src/app/(cabinet)/investor/{page,placement/page,meetings/page,statements/page}.tsx`, `src/app/(cabinet)/investor/_components/{InvestorIdentity,PortfolioHeader,HoldingsList,PlacementForm,VotePanel}.tsx`, `e2e/investor.spec.ts`

**Interfaces:**
- Consumes: `loadPortal(owner)`, `nextCoupon`, `estimateCoupon`, `openMeetings`, `buildVoteIx`, `buildSubscribeIx`, `walletTransactionSigner`/`signAndSendWithWallet` (wallet mode), Go `POST /demo/investor/subscribe|vote` (demo mode), session (`investor_demo`).
- Produces: identity resolution — if a wallet is connected use it (self-custody, signs in the browser); else if the session role is `investor_demo` use the demo investor address (`NEXT_PUBLIC_DEMO_INVESTOR`, default investor3) and send writes to `/api/bo/demo/investor/*`; else show a chooser card ("Connect wallet" / "Try the demo investor" → `/api/session/demo {role:"investor"}`).
- Note: `(cabinet)/investor` is accessible without a back-office session (wallet users); the layout shows the investor nav when no session.

- [ ] **Step 1:** Portfolio: petrol PortfolioHeader (face value total, received to date, next payment amount + date), KYC status chip (SAS attestation Address), HoldingsList cards (series, units, coupon, maturity, next coupon estimate, last payment with tx), entitlement history DataTable.
- [ ] **Step 2:** Placement: active series where the investor is registered; units field; price at par read-only; total; "Subscribe (DvP)" → wallet or demo path.
- [ ] **Step 3:** Meetings: open meetings with proposal, weight (snapshot units), segmented For/Against/Abstain + confirm, tally after voting.
- [ ] **Step 4:** Statements: per payout row with seev.036 download and tx link.
- [ ] **Step 5:** e2e: unauthenticated visit shows the chooser; demo investor sees ≥ 1 holding; vote flow in demo mode on an open meeting created by the issuer e2e (or skipped with a clear message when none is open).
- [ ] **Step 6: commit** `feat(web): investor cabinet — portfolio, placement, meetings, statements (wallet or demo)`

---

### Task 7: Retire legacy pages; RU/mobile sweep; deploy

**Files:**
- Delete: `src/app/(legacy)/**`, `src/components/Header.tsx`, legacy-only components no longer imported
- Modify: `next.config.ts` (`redirects`: `/console` → `/registrar`, `/series/:mint` → `/bonds/:mint`, `/actions/:pda` → `/registrar/actions/:pda`, `/portal` → `/investor`, `/kitchen-sink` → `/ui`), `README.md` + `reports/ui-walkthrough.md` links, `e2e/smoke.spec.ts` (point at new routes)
- Create: `e2e/sweep.spec.ts`

- [ ] **Step 1:** delete legacy, add redirects, fix imports; `make verify`.
- [ ] **Step 2:** `sweep.spec.ts`: for every route (public + each cabinet with demo sign-in) × locale (en, ru) × width (1440, 390): no console errors, no `[` + `]`-wrapped or dotted raw message keys visible (`/\b[a-z]+\.[a-zA-Z]+\b/` on text nodes from next-intl misses), no horizontal overflow; screenshots to `reports/ui/sweep/<route>-<locale>-<width>.png`.
- [ ] **Step 3:** deploy `ops/deploy-vps.sh`; run all e2e specs against `E2E_BASE_URL=https://qupon.85-192-29-7.sslip.io`.
- [ ] **Step 4: commit** `feat(web): retire legacy console; redirects; RU and mobile sweep`

---

## Self-review

- Spec §1 success criteria 1–3 → Tasks 2, 3–4, 6; criterion 4 (EN/RU, phone, tokens) → Task 7 sweep; criterion 5 (e2e green) → Tasks 1–7 specs + Plan 4.
- §3 IA: login + demo → Task 1; issuer → Task 2; registrar dashboard/investors → 3, actions → 4, activity/audit/autopilot → 5; investor → 6.
- §4 data flow (cookie, bearer, proxy) → Task 1; §6 errors → `runWrite`/`explainBoError` (Task 1) used everywhere.
- Review Focus 1 → Task 1 (`explainBoError` 401 test) + Task 2 e2e; 2 → Task 2 e2e request count; 3 → Task 4 read-only banner; 4 → Task 6 chooser; 5 → Task 7 sweep.
- Names consistent: `getSession`, `requireRole(path, ...roles)`, `boFetch`, `boPost`, `runWrite`, `explainBoError`, `isAllowedWrite`, `schedulePreview`, `SESSION_COOKIE`.
