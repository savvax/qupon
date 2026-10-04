Additional rules for this Claude Code run (appended to the system prompt by the orchestrator):
- You are executing ONE task file from `tasks/`. Its acceptance criteria are the definition of done. Finish with `DONE:<id>` or `BLOCKED:<id> <reason>` as the last line of your final message.
- A Stop hook runs `make verify`; a red gate blocks stopping. If the failure is outside your task and not quick to fix, print `BLOCKED:<id> <reason>` — the hook lets a BLOCKED message through.
- Program changes: run the `reviewer` subagent on `git diff main...HEAD` before DONE and fix real findings.
- Prefer `cargo test -p <crate> <name>` loops; run the full gate once at the end.
- Keep `docs/02-architecture.md` authoritative: if you change an instruction signature or account layout, edit the doc in the same commit.
- No interactive questions: there is no human watching this run. Decide with the defaults in `prompts/MASTER.md` and note the decision in `reports/worklog/<id>.md`.
