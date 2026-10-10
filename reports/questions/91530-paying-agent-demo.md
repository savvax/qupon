# 91530 — paying agent as a one-click demo role?

Task 91530 asks for one-click demo cards for "issuer, registrar, investor, paying agent" on
`/login`. The backend has no paying-agent identity: `services/registrar/internal/api/auth.go`
maps exactly `issuer|registrar|investor` (investor → `investor_demo`), and the web `Role` type
(`apps/web/src/lib/session.ts`) has no paying-agent value — the paying agent is an operator
wallet, and its step ("Confirm bank payout") is pushed from the registrar console
(`e2e/guidance.spec.ts`).

**Default taken:** shipped the three working demo roles; a fourth card that errors on click
would be worse than none. The registrar card's line already names the payout step.

**If a paying-agent demo identity is wanted**, it needs its own task: Go `demoRoles` + store
role, web `Role`/`ROLE_HOME`, a home cabinet (or a read-only view of bank-routed payouts),
mock sessions, and e2e. Roughly a backend+web task, not a design one.
