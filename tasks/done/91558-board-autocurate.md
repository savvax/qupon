---
id: 91558
title: "URGENT: production board curates itself (showcase featured, demo junk hidden) without an admin login"
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 120
---
## Goal
The public board on production (https://api.85-192-29-7.sslip.io/series) lists 60 series, none featured: e2e/demo
leftovers (`QPNb1-tm…`, `E2E-…`), judge sandboxes (`SBX-…`) and the superseded 4 s showcase. Reason: prod has no admin
account (QUPON_USERS is unset), so `POST /admin/showcase/seed` is never called, and `ops/deploy-vps.sh` never passes
`HIDE_SERIES` (config/hidden-series.txt is not consumed anywhere). The four new showcase series (1 day = 3600 s, mints in
config/featured-series.txt) must be featured and first; everything else non-curated hidden.

## Read first
services/registrar/internal/api/showcase.go (`showcaseSeed` — already picks the series on the definition's clock, latest
issue) + showcase_test.go, cmd/registrar/main.go (`seedPlatform`, HIDE_SERIES import via `HideSeriesIfUnset`),
internal/config/config.go, ops/deploy-vps.sh (registrar.env block), ops/hide-demo-series.sh, config/devnet.json.

## Do
1. Move the body of `showcaseSeed` into an exported function (e.g. `api.SeedShowcase(ctx, deps, st) (ShowcaseSeedResult, error)`);
   the handler calls it. No behaviour change for the endpoint.
2. `cmd/registrar/main.go`: when `SHOWCASE_AUTOSEED=1` (new config field), run it once after startup and then every
   10 minutes (goroutine + ticker, stops with the server context; log `seeded/hidden/missing` counts; an error is logged,
   never fatal). This also takes new judge sandboxes off the board within 10 minutes.
3. `ops/deploy-vps.sh` registrar.env block: `echo "SHOWCASE_AUTOSEED=1"` and
   `HIDE_SERIES=<mints of config/hidden-series.txt, comments/blank lines dropped, comma-joined>`.
4. `config/devnet.json`: delete the four `*-v1` series entries (Almaty-Power-v1, Astana-Metro-v1, Aktobe-Mining-v1,
   Atyrau-Oil-v1 — the superseded 4 s showcase; their mints are already in hidden-series.txt). Then run
   `ops/hide-demo-series.sh` (read-only devnet listing via the CLI; needs the repo `.env`) to refresh hidden-series.txt
   and check that none of the four mints in config/featured-series.txt ends up hidden.
5. Docs: one line in docs/04-stack.md (Gotchas): prod curates the board via SHOWCASE_AUTOSEED + HIDE_SERIES.

## Acceptance
- Go test: the extracted function features the showcase series and hides an uncurated demo-clock series (reuse the
  `showcaseRead` fake); a test that the autoseed loop runs immediately and stops on context cancel (inject the interval).
- `bash -n` + shellcheck clean for deploy-vps.sh; `make verify` green.
Commit `feat(registrar): self-curating public board (showcase autoseed + HIDE_SERIES)` (`task: 91558`).
Do NOT deploy (the lead deploys).

## Finish
Write `reports/worklog/91558.md` (3–6 lines), commit with `task: 91558`, print `DONE:91558` or `BLOCKED:91558 <reason>`.
