---
id: 1504
title: Kazakh locale — infrastructure + base messages
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 75
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1504 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/design/language.md (from 1530)
- apps/web/src/app/globals.css

## Plan section
### Task 1504: Kazakh locale — infrastructure + base messages

**Agent:** glm · **Depends on:** — · **Role:** frontend

**Files:**
- Modify: `apps/web/src/i18n/request.ts` (LOCALES `["en","ru","kk"]`, cookie accepts kk), `apps/web/src/app/api/locale/route.ts`, `apps/web/src/components/shell/LocaleSwitch.tsx` (3-way: EN · RU · KZ, accessible radio group), `apps/web/src/components/account/ProfileForms.tsx`, `apps/web/src/lib/session.ts` (`locale: "en" | "ru" | "kk"`), `apps/web/src/app/global-error.tsx`, `apps/web/src/i18n/altLabels.ts` + `apps/web/src/components/i18n/StableLabel.tsx` (reserve the max width of **all** other locales), `apps/web/src/lib/format.ts` + `apps/web/src/lib/ui/amount.ts` (kk → `kk-KZ`, same separators as ru), every `=== "ru" ? "ru" : "en"` / `as "en"|"ru"` site (≈30 files: `rg -n '"ru" \? "ru" : "en"|as "en" \| "ru"|"en" \| "ru"' apps/web/src`) → a shared `type Locale = "en" | "ru" | "kk"` and `toLocale()` helper in `apps/web/src/i18n/locale.ts`.
- Create: `apps/web/messages/kk.json` (full translation of `messages/en.json`).
- Modify: `AGENTS.md` rule 7 → "(RU/KK notice templates and `apps/web/messages/{ru,kk}` are the exceptions)".
- Modify: `apps/web/src/i18n/messages.test.ts` (iterate over all LOCALES; namespace files may be missing for kk until 1505 → test falls back to en for namespaces listed in `KK_PENDING` and fails when the list is non-empty after 1505).
- Modify: `services/registrar` API enums `lang`/`locale` accept `kk` (falls back to `en` for notices until 1523); `apps/web/src/lib/api-schema.d.ts` regenerated from `services/registrar/openapi.yaml`.

- [ ] **Step 1:** failing test — `messages.test.ts` expects `kk.json` keys == `en.json` keys and no empty values.
- [ ] **Step 2:** implement infra + `kk.json`. Translation rules: Kazakh Cyrillic; financial terms per KASE usage — облигация = «облигация», купон = «купон», өтеу (redemption), тіркеу күні (record date), ұстаушы (holder), эмитент, тіркеуші (registrar), төлем агенті (paying agent), құқық (entitlement → «төлемге құқық»), ерте өтеу (early redemption), ішінара өтеу (partial redemption), облигация ұстаушылар жиналысы (bondholder meeting), жинақталған купондық сыйақы / ЖКС (accrued interest), дефолт, «SIMULATED» stays in English as a badge. Keep placeholders `{…}` and ICU plurals intact (kk has `other` only).
- [ ] **Step 3:** `pnpm --filter @qupon/web test` and `pnpm --filter @qupon/web typecheck` pass; `e2e/locale-stability.spec.ts` extended to kk (control boxes identical across en/ru/kk).
- [ ] **Step 4:** commit `feat(web): Kazakh locale (kk) infrastructure and base messages`.

**Acceptance:** switching to KZ persists via cookie and profile; every base page renders in kk with no raw keys (sweep in kk shows no console errors for base namespaces); amounts/dates formatted `kk-KZ`; `make verify` green.

## Finish
`make verify` green, commits carry `task: 1504`, `reports/worklog/1504.md` written. Print `DONE:1504` or `BLOCKED:1504 <reason>`.
