---
id: 9051
title: state:dump --raw emits real base64; CI drift check catches untracked files; pin golangci-lint; fix verified-build date
agent: claude
tier: T1
depends_on: [051, 036]
verify: make verify
timeout_min: 20
---
## Steps
1. `clients/ts/src/commands/state.ts` rawBytes(): `String(a.data)` gives "1,2,3…"; use `Buffer.from(a.data).toString("base64")` and skip accounts whose `exists` is false. Vitest: dataB64 round-trips to the original bytes.
2. `.github/workflows/ci.yml` codama drift step: also fail when `git status --porcelain clients/ts/src/generated` is non-empty (new untracked generated files). Pin `golangci-lint` to the version installed locally (`golangci-lint version`) instead of `@latest`.
3. `reports/verified-build.md`: the date says 2026-10-12; the build was done on 2026-10-05 — correct it.

## Acceptance criteria
- [ ] Test passes; `make verify` green.
