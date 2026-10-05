# Plan 4 — Launch: hardening, demo data, live e2e, docs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The product from Plans 1–3 runs on the VPS as a polished, hardened, documented demo that judges can use end to end in EN or RU on a laptop or a phone.

**Spec:** `docs/superpowers/specs/2026-10-05-qupon-product-design.md` (§1 success criteria 4–5, §7 testing, §8 phases).

## Global Constraints
- Devnet only; no secrets in git or logs (deploy secrets go over ssh stdin into `/opt/qupon/*.env`, mode 600).
- Every page keeps working when the registrar API is down (calm empty/error states, no Next error overlay).
- Same design system, EN + RU, 390 px without horizontal scroll.

## Review Focus
1. A judge arrives after the last demo coupon was paid → there is still a series with holders and no open action, so "Announce" works (Task 2).
2. Direct links to removed legacy routes (`/console`, `/actions/<pda>`, `/series/<mint>`, `/portal`) land on the new pages (307 redirects; Task 4 live e2e checks them).
3. Clickjacking / MIME sniffing / referrer leaks on the public site (Task 1 headers, checked with `curl -I`).
4. 404 and 500 render in the new design in both locales (Task 1 e2e).
5. The live e2e must not depend on mock data: it creates its own series name and tolerates existing data (Task 4).

---

### Task 1 (glm): Production polish — headers, error pages, metadata
**Files:** `deploy/vps/Caddyfile`, `apps/web/next.config.ts`, `apps/web/src/app/not-found.tsx`, `apps/web/src/app/global-error.tsx`, `apps/web/src/app/(public)/error.tsx`, `apps/web/src/app/icon.svg`, `apps/web/src/app/opengraph-image.png` (1200×630, from the landing hero), `apps/web/src/app/layout.tsx` (metadata title template `%s · Qupon`, description, openGraph), per-page `generateMetadata` titles for `/`, `/bonds`, `/bonds/[mint]`, `/login`, cabinets; `e2e/errors.spec.ts`.
- [ ] Caddy: `header { Strict-Transport-Security "max-age=31536000"; X-Content-Type-Options nosniff; Referrer-Policy strict-origin-when-cross-origin; X-Frame-Options DENY; Permissions-Policy "camera=(), microphone=(), geolocation=()" }` on both hosts; Next `poweredByHeader: false`.
- [ ] `not-found.tsx` (EmptyState "Page not found" + links Home / Bonds) and `(public)/error.tsx` (EmptyState + Retry) in the new design, EN/RU messages `errors.notFound.*`, `errors.crash.*`.
- [ ] Icon = the Logo mark as SVG; OG image; titles per page.
- [ ] e2e: `/does-not-exist` → 404 page with the heading in EN and RU; every public page has a `<title>` ending in "· Qupon".
- [ ] `make verify` green; screenshots `reports/ui/errors-*.png`.

### Task 2 (claude): Demo data that never runs out
**Files:** `clients/ts/scripts/demo-full.ts` (`DEMO_SEED=1`: fresh series + KYC + register + issue 10/25/65 to investor1–3, stop before announcing), `Makefile` (`demo-seed`), `ops/deploy-vps.sh` (`--reindex`: restart the registrar so `indexSeries` registers new series), `README.md` ("Fresh demo data").
- [ ] `make demo-seed` creates `QPN-<mmdd>` with three holders, prints the mint; `ops/deploy-vps.sh --reindex` makes it appear in the cabinets.
- [ ] Run it once after the deploy so the live site has an untouched series.

### Task 3 (claude): Deploy Plans 1–3 and verify live
**Depends on:** the VPS has Docker again (human), 307 merged.
- [ ] `ops/deploy-vps.sh`; API `/healthz`, web `/`, `/login`, `/bonds` 200.
- [ ] In a real browser on the live site: demo issuer announces a coupon (fast timing) on the seeded series → demo registrar runs strike → snapshot → finalize → fund (issuer) → pay → complete; every step shows a tx link; screenshots EN + RU at 1440 and 390 to `reports/ui/live/`.

### Task 4 (glm): Live e2e mode
**Files:** `apps/web/playwright.config.ts` (when `E2E_BASE_URL` is set: `use.baseURL` = it and no `webServer`), `apps/web/package.json` (`e2e:live`), `apps/web/e2e/live/*.spec.ts` (tagged, skipped unless `E2E_BASE_URL`), `reports/e2e-live.md` writer.
- [ ] Specs: public pages 200 + no console errors; legacy redirects (Review Focus 2); demo sign-in for each role reaches its cabinet; issuer creates `E2E-<base36 time>` series (real devnet, ≤ 90 s) and sees it in `/issuer/series`.
- [ ] Mock-mode suite unchanged and green.

### Task 5 (glm): Docs and submission refresh
**Files:** `README.md` (product tour with the new screenshots, roles, demo sign-in, live links), `docs/02-architecture.md` (web routes, sessions, `/api/bo` proxy, auth endpoints), `docs/TECHNICAL_OVERVIEW.md` (back office + security model paragraph), `docs/SUBMISSION_FINAL.md` (links, what is simulated — wording identical to the landing table).
- [ ] No claim without a file, test or tx behind it; every simulated part labelled SIMULATED.

## Self-review
- Spec §1.4 (EN/RU, phone) → 307 sweep + Task 1; §1.5 (e2e green) → mock suite + Task 4 live; §8 deploy → Task 3; demo continuity → Task 2.
- Review Focus 1 → Task 2; 2 → Task 4; 3 → Task 1; 4 → Task 1; 5 → Task 4.
