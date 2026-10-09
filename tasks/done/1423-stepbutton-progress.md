---
id: 1423
title: StepButton waits on progress, not only status; website scheme case-insensitive
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 40
---
## Goal
1. Review of 1418: `apps/web/src/app/(cabinet)/registrar/actions/[pda]/StepButton.tsx` (~L85-99) stays loading until the status prop changes or 60 s pass. snapshot/pay/retire batches succeed without a status change until the last batch, so the button is dead for 60 s after every such step. Pass a `progress` prop (unitsSnapshotted, holdersPaid, holdersRetired) and end the wait when `status + progress` changes.
2. Review of 1419: website scheme check is case-sensitive (`HTTPS://x` rejected) in `services/registrar/internal/api/org.go` validWebsite and `apps/web/src/lib/httpUrl.ts`; compare case-insensitively. Add the web test that renders a `javascript:` website as plain text on the admin organizations page.

## Acceptance criteria
- Vitest: StepButton after success with unchanged status but changed progress → not loading.
- Go + vitest: `HTTPS://example.kz` accepted / rendered as a link; `javascript:alert(1)` rejected / plain text.
- `make verify` green; `reports/worklog/1423.md`.
