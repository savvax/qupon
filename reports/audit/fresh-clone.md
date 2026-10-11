# Fresh-clone reproducibility audit — task 91569 (2026-10-12, code-freeze day)

Judge path followed literally from `README.md` Quickstart, in a clone outside the repo
(`/tmp/qupon-fresh-91569`, HEAD `6930a91a` = main + queue-claim commit), with no `.env`
keys, no keypairs, no devnet writes. Machine: the shared dev box (macOS arm64) — toolchain
present, so install times are best-case for this box; a cold machine adds toolchain downloads.

## Step log

| # | Step | Command | Result | Time |
|---|---|---|---|---|
| 1 | Clone | `git clone "$PWD" /tmp/qupon-fresh-91569` | OK | ~8 s |
| 2 | Install | `bash ops/bootstrap.sh` | exit 0 (brew upgrades + golangci-lint compile dominate) | 512 s |
| 2b | Idempotency | `bash ops/bootstrap.sh` (2nd run) | exit 0 but **re-downloads Agave 4.3.0 every run** (A91569-3) | 32 s |
| 3 | Env | `cp .env.example .env` | OK; `make verify` needs neither `.env` nor keys | <1 s |
| 4 | Doctor | `make doctor` | **FAIL, exit 2** — "!! need Go 1.25" (go 1.26.4 installed) and "!! need Agave 4.3.x" (solana resolves 4.1.2) | 3 s |
| 5 | Gate | `make verify` | **VERIFY OK** — Rust 135 tests (entitlement 19 + program suites incl. LiteSVM), TS 259, Go all 23 packages, web typecheck+lint, OpenAPI lint (26 warnings, non-fatal) | 528 s |
| 6 | Web mock | `cd apps/web && pnpm dev` → `curl localhost:3000` | OK — home page renders from fixtures with **zero config** (`API_MOCKING` defaults on in dev; no `.env.local` needed) | ~15 s |
| 7 | Mock e2e | `cd apps/web && pnpm e2e` | **FAIL, exit 1** — 147 passed / **9 failed** / 8 skipped (A91569-2) | 1199 s |
| 8 | Dry runs | `make -n demo demo-coupon api` | OK — keyless inspection only; network/key steps clearly separated from `verify` | <1 s |

Positives worth keeping: `make verify` is genuinely self-contained (installs its own pnpm deps,
committed LiteSVM `.so` fixtures, no `.env`), the mock web needs no setup, and the README
quickstart's "no network" claim for verify holds.

## Findings (most severe first)

### A91569-1 [P1] `make doctor` fails immediately after a successful `ops/bootstrap.sh` — Go check pins 1.25, the repo pins 1.26

**Where:** `ops/doctor.sh:13`, `ops/bootstrap.sh:47` (vs `mise.toml` `go = "1.26"`, `services/registrar/go.mod` `go 1.26.0`, `docs/04-stack.md:36` "Go is 1.26, not 1.25").

**Evidence:** `make doctor` in the fresh clone, right after bootstrap exit 0:

```
  go             go1.26.4
  !! need Go 1.25
make: *** [doctor] Error 1     (exit 2)
```

`doctor.sh:13` is `[[ "$G" == go1.25* ]] || { echo "  !! need Go 1.25"; ok=1; }` — with the
**pinned** Go 1.26 installed (by bootstrap via mise/brew), the fatal check can never pass.
`bootstrap.sh:47` greps `go1\.25` for the same pin, so it also re-installs Go on every run on a
correct 1.26 box. CI never runs doctor, which is why this stayed green in CI. Any judge who runs
the quickstart sees the toolchain "broken" at step 3 — direct damage to Technical Execution (30%).

**Fix:** `ops/doctor.sh` and `ops/bootstrap.sh`: match `go1.26` (ideally read the pin from `go.mod`, as CI does).

### A91569-2 [P1] The mock e2e suite fails 9 of 156 runnable specs on a fresh clone

**Where:** `apps/web/e2e/*` (mock mode, `pnpm e2e`, own dev server on :3210, `API_MOCKING=enabled`).

**Evidence:** `cd apps/web && pnpm e2e` → `147 passed, 9 failed, 8 skipped` in 19.9 m, exit 1. Failing specs and first-error causes:

| Spec | Cause |
|---|---|
| `guidance.spec.ts:30` (NowBar per status fixture) | `VotingOpen` fixture: actor text `Holder` not found in the "Now" region |
| `kase-ui.spec.ts:59` (KASE panel, RU) | strict-mode violation: `67.52%` matches twice (`67.52%` and `67.52% / 84.73%`) |
| `registrar-action.spec.ts:137` (Defaulted column) | `/2 bank payouts await/` never visible |
| `termsheet.spec.ts:20` | paste→review→apply flow: heading text mismatch |
| `trades.spec.ts:26` | expected URL `/registrar/trades` not reached |
| `user-report-9112.spec.ts:25` | expected URL `/login?choose=1` not reached |
| `wallet-connect.spec.ts:7, :67, :89` | wallet dialog: install-links/choose/retry assertions fail (`toHaveCount`, element not found) |

Mock-fixtures/UI drift on main: the suite was green for the reports in `reports/ui/` but the
mock data or components moved since. (The `mock registrar exploded (e2e)` lines in the server
log are an intentional magic-mint 500 for the error-boundary test — not a failure.)

**Fix:** `apps/web` — update the mock fixtures/assertions for the nine specs above (one branch, run `pnpm e2e` until 156/156).

### A91569-3 [P1] Private-repo links: the submission's source links point at the still-private `github.com/savvax/qupon`

**Where:** `README.md:3` (CI badge), `README.md:209` (`solana-verify verify-from-repo https://github.com/savvax/qupon`), `docs/SUBMISSION_FINAL.md:5,50,78,85-90`.

**Evidence:** repo owner states it is private pending a decision; every judge path that leaves
GitHub (badge, verifiable-build reproduction command, submission-form repo links) 404s until it
is public or shared with `hackathon@colosseum.com`.

**Fix:** make `savvax/qupon` public (or invite `hackathon@colosseum.com`) before submission — owner is handling; not chased further per audit rules.

### A91569-4 [P2] `ops/bootstrap.sh` downloads Agave 4.3.0 but never repoints `active_release` — bootstrap is not idempotent and doctor keeps failing on machines with a prior Agave

**Where:** `ops/bootstrap.sh:21-24`; `~/.local/share/solana/install/active_release`.

**Evidence:** two consecutive bootstrap runs on a box with Agave 4.1.2 pre-installed:

```
==> agave 4.3.0
downloading v4.3.0 installer
  ✨ 4.3.0 initialized
$ solana --version
solana-cli 4.1.2 (src:182084b8; ...)
```

`releases/4.3.0/solana-release/bin/solana --version` → `4.3.0` (installed and working), but
`active_release` still symlinks to `releases/4.1.2`, so every run re-downloads (~15 s + network)
and `make doctor` keeps reporting "!! need Agave 4.3.x". Any Solana-active judge machine has a
prior Agave, so this is the likely path. (On a pristine machine the first install creates the
symlink correctly.)

**Fix:** `ops/bootstrap.sh`: after the install, verify `solana --version` is 4.3.x and if not `ln -sfn` the new release into `active_release`.

### A91569-5 [P2] `apps/web/.env.example` is referenced twice but does not exist; web mock mode and the mock e2e suite are absent from every quickstart

**Where:** `README.md:194` ("Env reference: `services/registrar/.env.example`, `apps/web/.env.example`"), `apps/web/README.md:14` ("Copy `.env.example` to `.env.local`") — no such file in `apps/web/`.

**Evidence:** `ls apps/web` → no `.env.example`; `cp apps/web/.env.example …` fails. Mock mode
works without it (defaults, step 6 above), so nothing functional breaks — but the README
instruction cannot be followed. Additionally, `grep -rn "pnpm e2e" README.md README-KIT.md
apps/web/README.md docs/` → no hits: the mock e2e suite (the fastest way for a judge to see the
whole UI without keys) is documented only inside `playwright.config.ts` comments, and the root
README quickstart never mentions the web app's mock mode at all.

**Fix:** add the 3-line `apps/web/.env.example` (or drop the two sentences), and one line in `apps/web/README.md` Scripts: "`pnpm e2e` — mock-mode Playwright suite (starts its own dev server)".

### A91569-6 [P2] Playwright browsers are an undocumented prerequisite of the e2e suite

**Where:** `ops/bootstrap.sh` (absent), `apps/web/README.md`, `docs/04-stack.md`.

**Evidence:** `grep -rn "playwright install" README.md docs/ apps/web/README.md ops/bootstrap.sh` → 0 hits; the suite needs `chromium-1243` in `~/Library/Caches/ms-playwright` (present on the dev box, absent on a fresh machine — first `pnpm e2e` would die with "Executable doesn't exist").

**Fix:** one line in `apps/web/README.md` (or bootstrap): `npx playwright install chromium`.

## Summary

1. `make verify` is fully reproducible from a fresh clone with zero secrets: green in 528 s (Rust 135, TS 259, Go 23 pkgs, lint, OpenAPI) — the core pitch holds.
2. The quickstart breaks one step earlier: `make doctor` fails unconditionally with the pinned Go 1.26 (A91569-1) and on any machine with a prior Agave (A91569-4) — the first thing a judge copying the README sees is a failing toolchain check.
3. The mock e2e suite — the cheapest judge demo of the UI — fails 9/156 specs (A91569-2) and is itself undocumented (A91569-5/6).
4. Everything pointing at `github.com/savvax/qupon` 404s while the repo is private (A91569-3, owner handling).
5. Recommended pre-freeze fixes, in order: the two doctor/bootstrap version checks, the nine e2e specs, `apps/web/.env.example` + two doc lines.
