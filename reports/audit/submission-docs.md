# Audit 91568 — submission package and docs accuracy

Date: 2026-10-12 (code freeze 12:00 Almaty). Scope: `README.md`, `docs/TECHNICAL_OVERVIEW.md`, `docs/SUBMISSION_FINAL.md`, `docs/07-submission.md`, `docs/PITCH_SCRIPT.md`, `docs/VIDEO_SCRIPT.md`, `docs/SECURITY_NOTES.md`, `docs/07-mainnet.md` vs `docs/00-brief.md` and vs reality (code, reports, live site). Production was touched with GET requests only; no sandbox created.

Verified true (no action needed): program id `QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd` = `config/devnet.json:3` everywhere; tKZT/USDC mints match config; all four live URLs answer 200 (`/`, `/login`, `/bonds`, `api…/healthz`); every relative markdown link in the eight docs resolves to an existing repo file; every `make` target and `ops/` script mentioned exists (`verify`, `demo`, `demo-coupon`, `demo-squads`, `demo-seed`, `api`, `deploy-vps.sh`, `deploy-mainnet.sh`, `bootstrap.sh`, `wallets.sh`, `config/mainnet-beta.json`); TECHNICAL_OVERVIEW covers all five required KASE topics plus an implemented-vs-simulated table; pitch script is 265 spoken words (1:54 at 140 wpm ≤ 2:00) and the demo script 265 VO words (~2:57 at 90 wpm ≤ 3:00) showing all three required scenarios with correct numbers (500/1,250/3,250; 10,600/26,500/68,900; 65/25/10 → 12%).

### A91568-1 [P0] The GitHub repo every submission points at is private

**Where:** `README.md:3` (CI badge), `README.md:209` (`solana-verify verify-from-repo https://github.com/savvax/qupon …`), `docs/SUBMISSION_FINAL.md:5,50,78,85-91` (GitHub field, "Anything else" links), `docs/07-submission.md:10`.
**Evidence:** `grep -rn 'github.com/savvax/qupon' README.md docs/SUBMISSION_FINAL.md docs/07-submission.md` → 10+ hits; `docs/SUBMISSION_FINAL.md:5` itself says "must be **public** or shared with hackathon@colosseum.com before submitting". Owner is handling it (per task brief); links not chased further.
**Fix:** Owner action — make `savvax/qupon` public (or grant hackathon@colosseum.com access) before 20:00; no doc change needed.

### A91568-2 [P1] Plan-15 features are shipped and lead the live landing page, but no submission doc mentions them

**Where:** `README.md` (absent), `docs/TECHNICAL_OVERVIEW.md` (absent), `docs/SUBMISSION_FINAL.md` "Anything else" (`:85-91`, absent), `docs/VIDEO_SCRIPT.md` (absent).
**Evidence:** `curl -s https://qupon.85-192-29-7.sslip.io/ | grep -oE …` → `Try it in 3 minutes`, `href="/sandbox/new"`, `autopilot`, `showcase`. In the repo: `apps/web/src/app/(public)/sandbox/`, `apps/web/src/app/(public)/proof/`, autopilot scheduler (`services/registrar/internal/scheduler/scheduler.go:1` "the autopilot loop"), accrued interest (`clients/ts/src/lib/accrued.ts`, `TradeAccrued` event), `make demo-plan15`, `make seed-showcase` (Makefile:67-71). `grep -rn 'sandbox|/proof|autopilot|showcase' README.md docs/TECHNICAL_OVERVIEW.md docs/SUBMISSION_FINAL.md` → 0 relevant hits. The submitted overview therefore undersells the product a judge sees on first click.
**Fix:** Add one paragraph + rows to `README.md` and `docs/TECHNICAL_OVERVIEW.md` (sandbox "Try it in 3 minutes", curated showcase, `/proof` export, autopilot, DvP with accrued interest) and one bullet each in `docs/SUBMISSION_FINAL.md` "Anything else".

### A91568-3 [P1] Program-surface counts are stale: tests, instructions, events, error codes

**Where:** `README.md:10` ("68 program tests"), `README.md:98` ("21 instructions, 5 account types, 35 error codes, 20 events"), `README.md:65` ("18 event types"), `README.md:134` ("Instructions (22)"), `docs/TECHNICAL_OVERVIEW.md:75,94` ("20 event types", "68 program tests"), `docs/SECURITY_NOTES.md:29` ("18 types").
**Evidence:** `grep -rh '#\[test\]' programs/qupon_bonds/{tests,src} | wc -l` → **116** (0 `#[ignore]`); IDL `target/idl/qupon_bonds.json` → **28** instructions, **28** events, **44** errors. Docs predate plan 15 (which added `attach_disclosure`, `set_payout_route`, `confirm_bank_payout`, `declare_default`, `init_hook`, `execute`).
**Fix:** Update the counts in README, TECHNICAL_OVERVIEW and SECURITY_NOTES to 28/28/44 and the real test figure (re-count after freeze).

### A91568-4 [P1] Devnet transaction counts disagree with each other and with the reports

**Where:** `README.md:8` ("71 transactions" for demo-full), `README.md:9` ("21 transactions" for demo-trade), `docs/SUBMISSION_FINAL.md:5` ("69 linked transactions") vs `:31` ("71 linked transactions") vs tweet `:120` ("71 devnet txs").
**Evidence:** `grep -oE 'explorer.solana.com/tx/…' reports/demo-full.md | sort -u | wc -l` → **60** unique tx links (+9 account links = 69 explorer links total); demo-trade → **20** unique tx links (+5 account links). "71" matches nothing; "21" matches neither 20 nor 25.
**Fix:** Pick one counting rule (unique tx links) and align README, SUBMISSION_FINAL facts line, description and tweet to the regenerated reports.

### A91568-5 [P1] Compute-unit claims contradict the report they cite

**Where:** `docs/TECHNICAL_OVERVIEW.md:94` — "retiring 12 frozen holders uses about 134k compute units, 22% of the 600k limit … an extra holder costs about 10k in the worst case — `reports/cu-benchmarks.md`".
**Evidence:** `reports/cu-benchmarks.md:26` — retire worst case 12 holders = **50,333 CU (4.0% of the 1.4M limit)**; `:41` — highest at CLI size 56,333 CU = **9.4% of 600k**; marginal holder ≈ 3.5k (`:26`). The heaviest CLI batch is `snapshot_batch` 8 holders = 82,790 CU = 13.8% of 600k (`:39`). The 134k/22%/10k figures appear nowhere in the report.
**Fix:** Replace with the report's actual worst case (retire 12 → 56,333 CU, 9.4% of the CLI's 600k; marginal ≈ 3.7k).

### A91568-6 [P1] SUBMISSION_FINAL has no value for two form fields: "distribution plans" and the Earn "X link"

**Where:** `docs/00-brief.md:74` (Colosseum form: "go-to-market, demand validation, distribution plans"), `docs/07-submission.md:17` (Earn: "website … X link"); `docs/SUBMISSION_FINAL.md:52-61` (GTM + validation only), `:72-81` (Earn table has no X-link row).
**Evidence:** `grep -n 'distribution' docs/SUBMISSION_FINAL.md` → 0 hits; the GTM block ends at validation. Fields that correctly remain `<<FILL>>` for the human: team names/backgrounds, pitch video (2:00), demo video (≤3:00), logo 512×512, validation conversations, Colosseum project/profile links, tweet + link, program-registration confirm.
**Fix:** Add a 2–3 sentence distribution block (white-label via depositories/brokers + KASE platform) and an "X link" row to the Earn tables in `docs/SUBMISSION_FINAL.md`.

### A91568-7 [P2] pay_batch size claims are stale (10/8 vs actual 5/4)

**Where:** `README.md:128` ("≤ 10/tx on-chain, 8/tx from the CLI"), `docs/SECURITY_NOTES.md:26` ("snapshot 8, pay 10, retire 12").
**Evidence:** `programs/qupon_bonds/src/instructions/settle.rs:29` → `PAY_BATCH_MAX: usize = 5`; `clients/ts/src/commands/action.ts:68` → `PAY_BATCH_MAX = 4`; `reports/cu-benchmarks.md:40` ("CLI sends 4"). snapshot 8 and retire 12 are correct.
**Fix:** Change both docs to "pay ≤ 5/tx on-chain, 4/tx from the CLI".

### A91568-8 [P2] Implemented-vs-simulated tables differ across README, TECHNICAL_OVERVIEW, SUBMISSION_FINAL and the site; the Squads row contradicts itself

**Where:** `README.md:143-156` (12 rows), `docs/TECHNICAL_OVERVIEW.md:98-108` (9 rows), `docs/SUBMISSION_FINAL.md:94-105` (10 rows, claims "same wording as the site's table"), site = 9 rows (`apps/web/messages/en.json` `landing.simulated`).
**Evidence:** Squads: README `:153` and TECHNICAL_OVERVIEW `:108` say "Demo: a 2-of-3 Squads vault is the paying agent and funds a coupon (`make demo-squads`)" — the demo exists (`reports/demo-squads.md`, Makefile target) — while SUBMISSION_FINAL `:105` and the site say "Roadmap — Planned". Row sets also differ (README splits KYC/kase.kz/digital tenge; SUBMISSION_FINAL adds term-sheet import).
**Fix:** Regenerate all four tables from one source row-set, and state Squads as "demo exists, multisig registrar is roadmap".

### A91568-9 [P2] Placeholders left in 07-submission.md drafts

**Where:** `docs/07-submission.md:33` ("conversations with [names/roles John collects during the week]"), `docs/07-submission.md:45` (tweet draft ends "Demo + code: [link]").
**Evidence:** `grep -n '\[link\]\|\[names' docs/07-submission.md` → those two hits. The section is marked "kept for history" and superseded by SUBMISSION_FINAL, but a judge skimming the docs folder sees unfilled brackets.
**Fix:** Either delete the superseded draft sections or replace the brackets with pointers to `docs/SUBMISSION_FINAL.md`.

### A91568-10 [P2] README env reference points at a file that does not exist

**Where:** `README.md:194` — "Env reference: `services/registrar/.env.example`, `apps/web/.env.example`".
**Evidence:** `ls apps/web/.env*` → no matches (`services/registrar/.env.example` and root `.env.example` do exist).
**Fix:** Drop the `apps/web/.env.example` mention (or add the file).

### A91568-11 [P2] Sweep screenshot count is stale

**Where:** `README.md:34` — "the 80 shots live in `reports/ui/sweep/`".
**Evidence:** `find reports/ui/sweep -type f | wc -l` → **323** files.
**Fix:** Update the number (or drop it and say "every route").

## Summary

1. One P0, all external: `savvax/qupon` is private while every form and the README point at it — owner action before 20:00.
2. Biggest content gap: plan-15 features (judge sandbox, showcase, `/proof`, autopilot, accrued-interest DvP) are live on the landing page but absent from every submission doc.
3. Numbers drifted after plan 15: tests 68→116, instructions 21/22→28, events 18/20→28, errors 35→44, tx counts 69/71 vs 60, CU 134k vs 56k, pay batch 10/8 vs 5/4, sweep 80 vs 323.
4. SUBMISSION_FINAL still needs a distribution-plans block, an Earn X-link row, and the human `<<FILL>>` items (videos, logo, team, links).
5. Links, live URLs, program id, make targets, script timings and the three required scenarios all check out; all fixes are doc-only.
