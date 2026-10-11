# Judge's scoring pass and top gaps to first place (task 91571)

Date: 2026-10-12 (≈ 03:40–04:00 Asia/Almaty). Code freeze 12:00 Almaty today, submission 20:00.
Method: strict KASE judge, 5 minutes per project, walking prod cold exactly as a stranger
(https://qupon.85-192-29-7.sslip.io). GET-only; exactly **one** sandbox created
(`urmmcwkh63`, idempotent `requestId`). Timings from `curl -w` (cold cache) and Playwright
load+settle. Screenshots: `reports/audit/shots/audit-judge-score/` (1280×800 JPEG).

## The judge journey (timed)

| Step | URL | Result | Time |
|---|---|---|---|
| Landing | `/` | HTTP 200; live devnet slot header, last completed payout with tx link, glossary | TTFB 2.28 s, total 4.12 s, 676 KB HTML · shot `01-landing.jpg` |
| "Try it in 3 minutes" | `/sandbox/new` → POST `/api/bo/demo/sandbox` | 201; countdown + step list shown while waiting | **create 42.3 s** · shot `02-sandbox.jpg` |
| Sandbox life | `/sandbox/urmmcwkh63` | announce at +177 s (bond calendar at 1 day/s), snapshot +62 s, coupon **Completed** with entitlements 500 / 1,250 / 3,250 tKZT and tax split 487.50 → net 2,762.50 | first money moved ≈ **5 min** after the click |
| Showcase dossier | `/proof/7MBQ…C35F` | "Certificate of corporate-action correctness": every number recomputed in-browser from devnet; on-chain vs simulated split | total 1.64 s · shot `03-dossier.jpg` |
| Proof picker | `/proof` | paste-any-mint verifier + two demo series (hook record date w/ default+cure+bank route; paused-mint w/ coupons+meeting+redemption) | total 1.30 s · shot `04-proof.jpg` |
| Technical overview | `/learn` | bond life in plain language, one coupon in six steps, three languages | total 2.95 s · shot `05-learn.jpg` |

The brief's worked example (10/25/65 bonds → 500/1,250/3,250) reproduced **live, unsupervised,
on devnet** — the single strongest thing a judge sees.

## Scores (KASE criteria)

**Technical Execution (30%) — 9/10.** Impressed: solana-verify verifiable build
(`reports/verified-build.md`), 68 LiteSVM program tests, shared entitlement vectors across
Rust/Go/TS, secondary settlement through the Solana Foundation's DvP program with a record-date
guard, and the in-browser recomputation on `/proof` that asks Qupon's servers nothing. Would cost:
every GitHub link on landing/learn/proof targets the **private** repo (A91571-1) — to a stranger
the code quality is invisible; cold landing is 2.3 s TTFB / 676 KB HTML (A91571-4).

**Corporate Action Logic (25%) — 10/10.** Impressed: worked example exact to the tenge including
withholding at source; record date enforced two ways (transfer hook on the new series, paused mint
on legacy); permissionless crank steps (snapshot "actor: anyone"); redemption with burn, bondholder
meeting → terms change, early redemption; seev.031 ISO 20022 notices; default-and-cure scenario
on the plan-15 dossier. Nothing material would cost points in a 5-minute look.

**Product & UX (20%) — 8/10.** Impressed: "Try it in 3 minutes" with a live countdown and step
list during the wait; one-click role sign-in at `/login` (issuer/registrar/investor, no wallet);
EN/RU/KZ; clean ✓/✗ proof dossier with explorer links everywhere. Would cost: 42 s create plus
~5 min to first payout vs the "3 minutes" promise (A91571-3); dense long pages (676 KB landing,
643 KB learn).

**Real-World Applicability (15%) — 8/10.** Impressed: live kase.kz data ingestion, paying-agent
bank routes with references, tax vault at source, ARDFM-shaped roles, mainnet guard in the API.
Would cost: KYC / ARDFM registration / Swift legs are SIMULATED (clearly labelled, and allowed by
the brief); no external regulated counterparty is named — past Colosseum fintech winners paired
one.

**Innovation (10%) — 8/10.** Impressed: the browser-side certificate of correctness is genuinely
novel for a corporate-actions tool; record-date-as-transfer-hook; permissionless corporate-action
crank. Would cost: the LLM term-sheet import is labelled experimental and not on the judge path;
core stack (Anchor + Token-2022) is solid rather than surprising.

**Weighted: 0.30×9 + 0.25×10 + 0.20×8 + 0.15×8 + 0.10×8 = 8.8 / 10.**

## Comparison with past winners (`docs/research/03-…-winners.md`)

Winners of RWA/fintech tracks (CargoBill, Autonom, Pencil Finance…) paired a regulated
counterparty with a concrete settlement flow and had accessible repos + tight videos. Qupon's
settlement flow and code quality are at that level or above; the two things winners had that a
judge cannot currently verify are the **public repo** and the **videos** — both are human work,
both still open (A91571-1, A91571-2). No prior "bond corporate actions" winner exists: being first
helps Innovation but raises the burden of explaining the domain — `/learn` and the dossier carry
that well.

## Findings (most severe first)

### A91571-1 [P0] Repository is private: all code evidence 404s for the judge
**Where:** https://github.com/savvax/qupon linked from `/` (footer "Source code"), `/learn`,
`/proof`, `/proof/<mint>`; `docs/SUBMISSION_FINAL.md:5`.
**Evidence:** `curl -s -o /dev/null -w '%{http_code}' https://github.com/savvax/qupon` → `404`
(not signed in). Links found on every judge-facing page: `github.com/savvax/qupon`,
`…/blob/main/docs/TECHNICAL_OVERVIEW.md`, `…/blob/main/reports/verified-build.md`.
**Fix:** owner action (being handled): make the repo public or add `hackathon@colosseum.com` as
collaborator before submitting; no code change.

### A91571-2 [P0] Submission text still has FILL placeholders for videos, logo, registration
**Where:** `docs/SUBMISSION_FINAL.md:50` (pitch/demo links, logo), `:80` (video links), `:114`
(program registration confirm).
**Evidence:** `grep -n 'FILL' docs/SUBMISSION_FINAL.md` → `<<FILL: YouTube unlisted link>>`,
`<<FILL: 512×512 PNG>>`, `<<FILL: confirm>>`.
**Fix:** record the 2:00 pitch and ≤ 3:00 demo (scripts exist: `docs/VIDEO_SCRIPT.md`,
`docs/PITCH_SCRIPT.md`) and paste the links before the 20:00 submission.

### A91571-3 [P1] "Try it in 3 minutes" takes ~5 minutes to first money; create alone is 42 s
**Where:** `services/registrar/internal/sandbox/sandbox.go:29-31` (1 civil day/s clock ⇒ first
announce ≈ 177 s after issue); POST `/api/bo/demo/sandbox`.
**Evidence:** create: `HTTP 201, total 42.328684s`; polls: `next.at` = issue+177 s (announce),
+62 s (snapshot), coupon `Completed` with entitlements only on the 4th poll ≈ 5 min after start.
The waiting screen is good (steps + elapsed timer), but a 5-minute judge who clicks late sees an
empty entitlement table.
**Fix:** backdate the sandbox issue date in the demo calendar so the first announce lands ≤ 30 s
after create (one constant/offset in `sandbox.go`), keeping payment dates honest.

### A91571-4 [P1] Landing cold start: 2.3 s TTFB, 676 KB HTML
**Where:** `apps/web/src/app/(public)/page.tsx` (+ `_landing/`).
**Evidence:** `curl -w` on cold `/`: `TTFB 2.2796 s, total 4.116 s, 676568 B`; `/learn` 643 KB,
`/proof` 540 KB. Playwright load+settle 6.8 s for the landing.
**Fix:** prerender/cache the landing hero (it is static except the devnet slot header) and trim
the inline payload so the first judge screen paints in < 1 s.

### A91571-5 [P2] /proof browser verification depends on the public devnet RPC
**Where:** `apps/web/src/components/proof/*` (page copy: "Read from api.devnet.solana.com").
**Evidence:** dossier copy on `/proof/7MBQ…`: "Reading devnet… / Read from api.devnet.solana.com at
slot …"; public RPC is rate-limited, so a check row could stall or show ✗ under load during
judging.
**Fix:** add a fallback RPC endpoint list for the client-side verifier (S, config-level).

### A91571-6 [P2] No demo video embedded on the site
**Where:** `/` and `/learn` (text only).
**Evidence:** page scan of landing/learn/proof HTML: zero youtube/loom/vimeo links; judges must
read or run the sandbox.
**Fix:** once A91571-2's videos exist, embed the demo on `/learn` and link it from the landing
hero.

## TOP 10 changes that would most raise the score

| # | Change | Criterion | Expected gain | Effort | Code (before 12:00 freeze) or human |
|---|---|---|---|---|---|
| 1 | Make `savvax/qupon` public (or +hackathon@colosseum.com); README as front door | Technical Exec | largest single lever (~+0.5 weighted; unlocks the 30% criterion's evidence) | S | human (owner), before submitting |
| 2 | Record pitch 2:00 + demo ≤ 3:00, fill every `FILL` in `docs/SUBMISSION_FINAL.md` | all (judge communication) | ~+0.4 | M | human |
| 3 | Backdate sandbox issue so announce ≤ 30 s after create (A91571-3) | Product & UX | ~+0.2 | S | code — `sandbox.go` |
| 4 | Cut sandbox create 42 s → < 20 s (parallelize/pre-warm the devnet setup txs) | Product & UX | ~+0.1 | M | code |
| 5 | Prerender landing hero, cut 676 KB HTML (A91571-4) | Product & UX | ~+0.1 | S/M | code |
| 6 | Embed the demo video on `/learn`, link from landing (A91571-6) | Product & UX | ~+0.1 | S | human + code |
| 7 | One landing line naming the market path (KASE side track, ARDFM sandbox, paying-agent bank) | Real-World | ~+0.1 | S | human text |
| 8 | Fallback RPC for the `/proof` verifier (A91571-5) | Technical Exec | ~+0.05 | S | code |
| 9 | Colosseum form completeness: GTM/demand text, pre-existing-code disclosure, all profiles | Colosseum judging (same videos) | n/a for KASE score, needed for the main track | S | human |
| 10 | Week-4 one-minute update video (Colosseum recommendation) | Colosseum | goodwill | S | human |

## Summary
- Walked the full judge journey on prod: every page fast and polished; the sandbox reproduces the
  brief's exact numbers live on devnet — Corporate Action Logic is a 10.
- Weighted score today: **8.8/10**; the ceiling is set by judge-visibility, not by the product.
- Two P0s are pure human work: the private repo hides all Technical Execution evidence, and the
  submission text still has video/logo placeholders.
- The one P1 code gap: the "3 minutes" sandbox is really ~5 min (42 s create + coupon calendar);
  a one-constant backdate fixes most of it before the freeze.
- With repo public, videos in, and the sandbox shortened, this is a credible first place.
