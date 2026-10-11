---
id: 91560
title: "URGENT: concurrent CLI runs lose series entries in config/devnet.json (sandbox fails on prod)"
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 120
---
## Goal
Production sandbox creation failed during the live e2e (issuer series test running in parallel):
`executor_failed: register Altyn Capital: cli investor:register refused: qupon: series.SBX-SY9BHF.mint is not set`.
Root cause: `clients/ts/src/lib/bondMintFlow.ts:120` writes `updateConfig(cfgPath, { series: { ...cfg.series, [name]: entry } })`
with `cfg` read at command START (tens of seconds earlier), and `updateConfig` (`clients/ts/src/lib/config.ts:175`) is
an unlocked read-modify-write. Two concurrent `series:create` runs (two judges, a judge + the issuer cabinet) → the later
write drops the other's series. Same pattern in `clients/ts/src/commands/seriesCreate.ts:104`.

## Do
1. `updateConfig(path, mutate: (c: Record<string, unknown>) => void)`: take an exclusive lock (`<path>.lock` created with
   `openSync(lock, "wx")`, retry every 50–100 ms up to 30 s, break a lock older than 60 s), re-read the file fresh, apply
   `mutate`, write to `<path>.<pid>.tmp` and `renameSync` over the file (atomic), release the lock in `finally`.
   No new dependencies.
2. Callers mutate only their own nested entry on the FRESH object: `c.series[name] = { ...(c.series[name] ?? {}), ...fields }`
   — never spread a stale `cfg.series`. Fix all callers (`rg -n 'updateConfig\(' clients/ts/src`).
3. Test (vitest): spawn 8 child processes (node + tsx running a tiny script that calls `updateConfig` to add a distinct
   `series.T<n>` entry, with a random 0–50 ms delay between read-intent and write) on a temp config → all 8 entries
   present, file is valid JSON, no `.lock`/`.tmp` left. Plus a unit test: a stale-lock (mtime > 60 s) is broken.
4. Check the registrar container: QUPON_CONFIG lives on the `/data` volume (compose: "executor config regenerated here at
   startup") — confirm the runtime user can create files in that directory (lock + tmp + rename need directory write);
   fix entrypoint.sh if not.
5. One line in docs/04-stack.md (Gotchas): config writes are locked + atomic; never write a stale whole map.

## Acceptance
Test above green; `make verify` green. Commit `fix(cli): locked atomic config updates (concurrent series:create lost entries)`
(`task: 91560`). Do NOT deploy.

## Finish
Write `reports/worklog/91560.md` (3–6 lines), commit with `task: 91560`, print `DONE:91560` or `BLOCKED:91560 <reason>`.
