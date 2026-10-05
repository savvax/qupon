---
id: 9029
title: Web — mock API opt-in with visible banner; ISIN fix; untrack vitest output
agent: flash
tier: T1
depends_on: [029]
verify: make verify
timeout_min: 20
---
## Steps
1. `apps/web/src/lib/api.ts`: mocking only when `API_MOCKING=enabled`; when active, the layout shows a visible "MOCK DATA" banner.
2. `apps/web/src/mocks/api.ts`: ISIN `KZ2C0QUPON001` → `KZ2C0QUPON01`.
3. `git rm --cached -r apps/web/.vitest` and add `apps/web/.vitest/` to `.gitignore`.

## Acceptance criteria
- [ ] `make verify` green; `rg KZ2C0QUPON001` returns nothing.
