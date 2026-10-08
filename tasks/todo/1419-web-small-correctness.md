---
id: 1419
title: Web/registrar: redemption escrow alert, next-step by units, org website scheme
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 45
---
## Goal
1. `apps/web/src/app/(cabinet)/registrar/_components/Pipeline.tsx` (~L41, deriveAlerts): escrow-short ignores principal for REDM/MCAL/PCAL → include `perUnitPrincipal × unitsSnapshotted` (or `totalPrincipal` if the API exposes it), like `actions/[pda]/page.tsx` ~L147-155.
2. `apps/web/src/lib/actionFlow.ts` (~L296-299): RecordStruck next step compares holder count with `investors` (undefined when listInvestors fails) → compare `unitsSnapshotted` with the series supply, as the Go executor's NextStep does; supply 0 → waiting, not snapshot.
3. Org website: `services/registrar/internal/api/org.go` (~L74) accepts any string; validate `^https?://` (400 otherwise, EN error), and `apps/web/src/app/(cabinet)/admin/organizations/page.tsx` (~L56) renders a link only for http(s) URLs, plain text otherwise.

## Acceptance criteria
- Vitest: deriveAlerts REDM case where escrow covers net+tax but not principal → alert.
- Vitest: nextStep with investors undefined and units == supply → finalize.
- Go test: website "javascript:alert(1)" → 400; web test renders it as text.
- `make verify` green; `reports/worklog/1419.md`.
