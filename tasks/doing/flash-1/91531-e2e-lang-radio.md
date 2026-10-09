---
id: 91531
title: e2e language switch locator (radio, not button)
agent: claude
tier: T1
depends_on: [1531]
verify: make verify
timeout_min: 180
---
## Goal
Since task 1504 the language switch is a radio group (`role="radio"`, names "English", "Русский", "Қазақша"), but four
Playwright specs still click `getByRole("button", { name: "ru" })` and fail on main.

## Read first
- apps/web/e2e/landing.spec.ts, shell.spec.ts, errors.spec.ts, registrar-activity.spec.ts
- apps/web/src/components/shell (the language switch component)

## Do
- In those four specs replace the `button "ru"` / `"en"` / `"kk"` locators with `page.getByRole("radio", { name: "Русский" })` (and the matching names for en/kk). No other changes.
- Run each spec in mock mode (`cd apps/web && pnpm exec playwright test e2e/<spec> --project=chromium`) and make them pass.

## Acceptance
The four specs pass in mock mode; `make verify` green; commit `test(web): language switch is a radio group in e2e` (`task: 91531`).

## Finish
Write `reports/worklog/91531.md`, print `DONE:91531` or `BLOCKED:91531 <reason>`.
