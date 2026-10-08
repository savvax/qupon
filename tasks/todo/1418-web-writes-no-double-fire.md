---
id: 1418
title: Web: loading buttons are disabled; vote and next-step stay done while devnet lags
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 60
---
## Goal
1. `src/components/ui/Button.tsx` (~L69-73): `loading` only sets pointer-events-none/aria-disabled, so Enter/Space fires the handler again (DisclosurePanel submit, TradeRowActions, CustodianDialog have no busy guard). Set `disabled={disabled || loading}`.
2. `src/app/(cabinet)/investor/_components/VotePanel.tsx`: (~L127) For/Against/Abstain enabled when the investor is not in the snapshot (`mine` undefined) → disable; (~L180-184) after a successful vote the immediate reload still reads `vote: "None"` on devnet and re-enables the buttons → keep the cast vote in local state keyed by the action PDA (like OpenTrades' `sent` set) and merge it into `voted`.
3. `src/app/(cabinet)/registrar/actions/[pda]/StepButton.tsx` (~L83-89): after a successful advance the button re-enables before polling sees the new status → keep it loading while the status is still the one the step started from (until it changes or polling ends).

## Acceptance criteria
- Vitest/RTL: `<Button loading onClick={fn}>` + Enter → fn not called.
- Vitest: MeetingCard without entitlement → 3 vote buttons disabled; after a mocked successful vote with an unchanged reload → still disabled and "voted" shown.
- Vitest: StepButton after success with unchanged status prop → still loading.
- `make verify` green; `reports/worklog/1418.md`.
