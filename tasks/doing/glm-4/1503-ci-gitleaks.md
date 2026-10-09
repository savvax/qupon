---
id: 1503
title: CI secret scan (gitleaks)
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 30
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1503 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)

## Plan section
### Task 1503: CI secret scan (gitleaks)

**Agent:** flash · **Depends on:** —

**Files:** Modify `.github/workflows/ci.yml` (new job `secrets`), Create `.gitleaks.toml`, Modify `Makefile` (target `secrets-scan`, not part of `verify`).

- [ ] **Step 1:** job:

```yaml
  secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - name: gitleaks (full history)
        run: |
          curl -sSfL -o gl.tgz https://github.com/gitleaks/gitleaks/releases/download/v8.24.2/gitleaks_8.24.2_linux_x64.tar.gz
          echo "<sha256 from the release checksums.txt>  gl.tgz" | sha256sum -c -
          tar xzf gl.tgz gitleaks && ./gitleaks git --redact --config .gitleaks.toml -v .
```

Fill the checksum from `https://github.com/gitleaks/gitleaks/releases/download/v8.24.2/gitleaks_8.24.2_checksums.txt` (download and copy the line for `linux_x64`; never leave the placeholder).
- [ ] **Step 2:** `.gitleaks.toml` extends the default rules and allowlists public devnet addresses (`config/devnet.json`, `fixtures/accounts/*.b64`, `reports/*.md` explorer links) by path.
- [ ] **Step 3:** `make secrets-scan` runs the same locally if `gitleaks` is on PATH (else prints how to install). Run it; if it reports a real secret, STOP: print `BLOCKED:1503 secret found in history <file>` (do not try to rewrite history).

**Acceptance:** CI job present with pinned checksum; local run clean or BLOCKED with the finding; `make verify` green.

## Finish
`make verify` green, commits carry `task: 1503`, `reports/worklog/1503.md` written. Print `DONE:1503` or `BLOCKED:1503 <reason>`.
