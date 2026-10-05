---
id: 9023
title: Executor timeout must kill the CLI's process group (CI failure TestRunTimeout)
agent: claude
tier: T1
depends_on: [023]
verify: make verify
timeout_min: 30
---
## Goal
CI (ubuntu) fails `TestRunTimeout`: `exec.CommandContext` kills only the shell, the grandchild keeps stdout open and `Wait` blocks past the 120 s cap. Same with the real pnpm shim → node.

## Acceptance criteria
- [ ] Timeout kills the process group; test uses a grandchild that holds stdout; `make verify` green locally and in CI.
