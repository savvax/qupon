# 91537 — verify runs in a worktree that now belongs to task 91519

**What happened.** Session 91537 started in `.worktrees/glm-8`. After an interruption, the queue re-assigned
`glm-8` to `task/91519-cli-series-list` (it is registered there now, tip 3ea86cd4, and its lifecycle — deleted
and re-created between rounds — matches the `getcwd` failures reported by the verifier). The automated
`make verify` for 91537 still uses the session's original cwd `glm-8`, so it either hits a deleted directory
(`make: getcwd: No such file or directory`) or would verify the wrong branch.

**Where 91537's work actually is.** Branch `task/91537-web-learn-plan15` @ `381ef50d`
(`feat(web): /learn explains the plan-15 mechanics`, `task: 91537`), checked out in
**`/Users/dev/code/hackatons/kase/qupon-kit-w91537`** — `make verify` green there (re-run after each round),
rebased on main, status clean. All acceptance items pass (unit tests incl. messages/glossary, guidance.spec,
locale-stability.spec, typecheck, lint, screenshots 1440/390 × en/ru/kk in `reports/design/91537/`).

**Why I did not "fix" it by retaking glm-8.** glm-8 is a live worker's worktree; re-registering it to my branch
would break task 91519 and re-trigger mutual deletion (this already caused the round-1 SIGKILL storms).

**Decision needed (default in bold).** Re-point 91537's verification to
`/Users/dev/code/hackatons/kase/qupon-kit-w91537` (**default: run `make verify` there; merge
`task/91537-web-learn-plan15`; then `git worktree remove /Users/dev/code/hackatons/kase/qupon-kit-w91537`**),
or explicitly free `glm-8` and hand it back to 91537.
