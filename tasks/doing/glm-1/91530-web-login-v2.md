---
id: 91530
title: login and sign-up in the v2 design language
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 180
---
## Goal
`/login` and `/signup` are the first screens a judge sees after the landing; bring them to the v2 design language.

## Read first
- docs/design/language.md (tokens, type scale, primitives — follow it strictly)
- apps/web/src/app/(public)/login, (public)/signup, apps/web/src/app/ui (primitives gallery), apps/web/e2e/login.spec.ts
- apps/web/messages/{en,ru,kk} (strict key parity is tested)

## Do
- Rebuild both pages with the v2 primitives: one-click demo roles (issuer, registrar, investor, paying agent) as the
  primary path with one line each on what that role can do; email sign-in secondary; wallet sign-in where it exists today.
- 390 px: no horizontal scroll, tap targets ≥ 44 px; keyboard: visible focus, Enter submits.
- Keep every existing behaviour and test id; update `login.spec.ts` only where markup moved.
- Screenshots (`bash ops/shots.sh` or Playwright) at 1440/390 in en/ru/kk → `reports/design/91530-login/`.

## Acceptance
typecheck, lint, unit tests, `login.spec`, `sweep.spec`, `locale-stability.spec` green in mock mode; `make verify`
green. Commit `feat(web): login and sign-up in the v2 design` (`task: 91530`).

## Finish
Write `reports/worklog/91530.md` (3–6 lines), commit with `task: 91530`, print `DONE:91530` or `BLOCKED:91530 <reason>`.

## Review feedback (round 1, 2026-10-10 13:22) — fix every blocking item first; your previous work is already committed on this branch

### Summary
The rebuild follows v2 well: the h1 uses text-title, tokens are used throughout, cards are rounded-card and rows rounded-btn, demo is the primary path, email is secondary, and the no-JS post and test ids are kept. Two things block the merge. First, every committed screenshot in reports/design/91530-login shows the old design. Second, wrapping the inline sentence fragments in StableText opens a visible gap inside 'New investor? Create an account' and 'Уже есть аккаунт? Войти', and those links are only about 20 px tall at 390. Both fixes are small: unwrap the fragments, add min-h-11 to the links, then regenerate the shots.

### Blocking
- reports/design/91530-login/login-en-1440.png — The committed screenshots in reports/design/91530-login/ are stale. All 12 PNGs show the pre-change design: the dark p900 demo panel, the 'Sign in to the back office' heading and the dark signup aside. The task's Do list requires screenshots of the rebuilt pages at 1440/390 in en/ru/kk, and the worklog says they exist. My fresh shots (logs/shots/91530-web-login-v2) show the new design, so the committed files misrepresent the work.
  **Fix:** After applying the fix below, regenerate: `SHOT_LOCALES="en ru kk" bash ops/shots.sh reports/design/91530-login /login /signup`. Check that login-en-1440.png shows the h1 'Sign in' with a white demo card bordered in g200 on the left. Commit the 12 PNGs.
- apps/web/src/app/(public)/login/LoginForm.tsx:113 — Wrapping the inline sentence fragments in <StableText> breaks the account links. StableText is inline-grid and reserves the widest locale's width, so a large gap opens inside the sentence: 'New investor?' then about 65 px of blank space before 'Create an account' on /login en 1440 (also visible at 390 and in ru), and 'Уже есть аккаунт?' then about 46 px before 'Войти' on /signup ru 390. It reads as a layout bug on the first screen judges see. The links are also about 20 px tall at 390, which misses the task's 'tap targets ≥ 44 px'.
  **Fix:** In LoginForm.tsx:113-119, remove the <StableText> wrappers around t("newInvestor") and t("createAccount"). Do the same in SignupForm.tsx for t("haveAccount") and t("signIn"). Render plain strings as before this diff; locale-stability passed with plain strings at base. Add `inline-flex min-h-11 items-center` to both <Link>s so the tap target is ≥ 44 px and the <p> keeps the same height in every locale. Re-run `pnpm exec playwright test e2e/login.spec.ts e2e/locale-stability.spec.ts` in mock mode.

### Acceptance criteria not met
- 390 px: no horizontal scroll, tap targets ≥ 44 px; visible focus; Enter submits — No horizontal scroll in the en/ru 390 shots. Demo rows are min-h-16 and the submit buttons are size lg. A global :focus-visible ring exists. The form submits on Enter. But the inline 'Create an account' and 'Sign in' links are about 20 px tall.
- Screenshots 1440/390 en/ru/kk in reports/design/91530-login/ — All 12 files exist, but login-en-390.png and login-kk-390.png show the old dark-panel design with the old heading, and signup-kk-1440.png shows the old dark aside.

Design score: 7/10
