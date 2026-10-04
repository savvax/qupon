---
name: verify
description: Run the project gate (make verify) and summarize failures by component with the exact failing test names and the first error line. Use before claiming DONE.
allowed-tools: Bash(make verify), Bash(cargo test *), Bash(go test *), Bash(pnpm *), Read, Grep
---
Run `make verify`. If green, reply "VERIFY OK". If red, list each failing component → failing test/lint names → first error line → the most likely file. Do not fix anything in this skill; the caller fixes.
