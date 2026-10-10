# 91552 — two agents share this worktree; my uncommitted edits were destroyed

## What happened
- Around 03:01–03:03 (+05) a second agent (task 91551-design-action-flow; its 15 files appear as uncommitted
  modifications in this worktree) interleaved `git stash` cycles with mine: all nine of my uncommitted files were
  reset to HEAD while theirs stayed. `git stash list` ended empty.
- Recovery: my exact changeset survived as dangling stash commit `42768c0d` ("WIP on task/91552…");
  `git checkout 42768c0d -- <9 files>` restored it bit-identically (79+/54−) and I committed immediately
  (10ad0880) so further stash collisions cannot eat it. Their uncommitted files were never touched and are still
  in the worktree for them to commit.
- Question: was 91551 supposed to run in `.worktrees/glm-7` too? If yes, expect more stash races; if not, its
  agent picked the wrong worktree. Default taken: recovered, committed only my files, continued.

## Pre-existing, time-flaky `e2e/locale-stability` failures at HEAD (not from 91552)
- Cabinet NowBar `<p>` width is locale-variable on /investor, /registrar, /issuer/series/new; whether it fails
  depends on which action the mock's live clock currently promotes ("Fund escrow" vs "Confirm bank payout"
  observed 40 min apart). File: `components/shell/StepNowBar.tsx` (task 91551's scope, finding 10).
- kk 390 `/` hero: the eyebrow (`Hero.tsx`, plain `t("hero.badge")`) makes kk content ~16 px taller, shifting the
  centered h1 up 8 px — this is finding 3 itself (task 91549).
