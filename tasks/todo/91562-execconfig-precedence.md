---
id: 91562
title: "URGENT: executor config regeneration drops live mints (sandbox fails, showcase autopilot stalls on prod)"
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 180
---
## Goal
`services/registrar/internal/execconfig/execconfig.go` `Write(base, out, registryRows)` rebuilds the CLI config
(`/data/qupon-config.json` on prod) from the base config + `series_registry`, a registry row overriding a same-named base
entry, `entry["mint"] = r.Mint` even when `r.Mint == ""`. Three production failures (2026-10-11) come from it:
1. **Sandbox creation fails under concurrency.** `internal/sandbox/sandbox.go` inserts a placeholder registry row
   (mint "") and runs `series:create` (the CLI writes the real mint into the exec config) but never upserts the mint
   into the registry; any concurrent `writeExecConfig` (issuer create `internal/api/issuer.go:130–230`, another sandbox,
   a rollback) rewrites the entry with mint "" → `cli investor:register refused: series.SBX-B25PSY.mint is not set`.
2. **Showcase autopilot stalls.** The registry still has an old `Almaty-Power` row (mint Bs27…, the superseded 4 s
   showcase); it overrides the base (`config/devnet.json`: Almaty-Power = 5tww…), so the scheduler logs every few seconds
   `mint 5tww8A3M… is not a series in /data/qupon-config.json` and the curated coupon never advances.
3. Go's atomic rename and the CLI's locked `updateConfig` (task 91560, `<path>.lock`) do not serialise with each other.

## Do
- `execconfig.Write`:
  (a) take the same lock the CLI uses (`<outPath>.lock`, O_CREATE|O_EXCL, retry 50–100 ms up to 30 s, break a lock older
      than 60 s; see `clients/ts/src/lib/config.ts` `updateConfig`), read the CURRENT outPath (if it exists) inside the lock;
  (b) precedence per series name: base entry with a non-empty mint wins over a registry row with a different mint (log
      a warning once per name); a registry row with mint "" never overwrites a non-empty mint from the base or from the
      current outPath (an in-flight `series:create` wrote it); registry-only names behave as today;
  (c) keep entries present in the current outPath that are neither in base nor registry (written by the CLI directly).
- `sandbox.go`: right after a successful `series:create`, `UpsertRegistry` the row with the real mint and rewrite the
  config (as issuer.go does) BEFORE any further CLI step.
- Table tests for each precedence rule, a test that a concurrent placeholder rewrite keeps the CLI-written mint, and a
  sandbox test (fake executor) asserting the registry row holds the mint when `investor:register` runs.
- Reproduce locally (registrar against devnet like task 91556, `SCHEDULER=1 AUTOFUND=1`): fire `POST /demo/sandbox`
  and an issuer `POST /issuer/series` (demo issuer login) at the same time, 3 rounds → all succeed. Also capture what the
  issuer create returned in that race on prod (409 after 6.5 s) and fix it if it is a different cause.
- docs/04-stack.md Gotchas: one line on the exec-config precedence rules.

## Acceptance
Tests green; the concurrent local run succeeds 3/3 (put the commands + results in `reports/worklog/91562.md`);
`make verify` green. Commit `fix(registrar): exec config keeps live mints (precedence + shared lock)` (`task: 91562`).
Do NOT deploy.

## Finish
Write `reports/worklog/91562.md`, commit with `task: 91562`, print `DONE:91562` or `BLOCKED:91562 <reason>`.
