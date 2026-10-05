---
id: 9301
title: CLI default corporate-action id must fit 16 bytes for any series name (found in the live check)
agent: claude
tier: T1
depends_on: []
verify: make verify
timeout_min: 30
---
## Goal
`action:announce` / `meeting:announce` default the CORP id to `<series>-<KIND>-####`; for series names longer than 5
characters (every wizard-created series) that is > 16 bytes and the CLI refuses — announce from the issuer cabinet
fails. Shorten the series part so the default always fits; keep `QPNb1-INTR-0001` unchanged.

## Acceptance criteria
- [ ] Shared `defaultCorpId(series, kind, n)` with a unit test; both commands use it.
- [ ] `make verify` green; `reports/worklog/9301.md`.

## Finish
Commit with `task: 9301`, then `DONE:9301`.
