---
id: 9601
title: Decide CORS origin policy for public reads (scanner heuristic vs documented wildcard)
agent: flash
tier: T2
depends_on: []
verify: make verify
timeout_min: 30
---
## Goal
The static scanner flags `Access-Control-Allow-Origin: *` in `services/registrar/internal/api/api.go` (`corsReadOnly`). The code is deliberate and documented (public devnet reads for the investor portal from any origin; no `Allow-Credentials` header is ever sent, so credentialed requests are impossible; writes get no CORS headers). Decide once, with the human, whether to keep the documented wildcard or restrict reads to configured origins.

## Read first
- `services/registrar/internal/api/api.go` (`corsReadOnly` and its comments)
- `reports/questions/601-cors-wildcard.md`

## Steps
- Ask the human which web origins must read the API from a browser (portal domain, sslip.io domain, localhost dev).
- Default (if no answer): keep the wildcard for GET/HEAD and add the rationale to the scanner's ignore list or a documented suppression; do not add `Allow-Credentials`.
- Alternative: `Deps.AllowedOrigins []string` (env `QUPON_ALLOWED_ORIGINS`); when set, echo the request Origin only for entries in the list, else no CORS headers.

## Acceptance criteria
- Decision recorded in `docs/04-stack.md` or a comment; scanner finding resolved or consciously suppressed with a reference; `make verify` green.

## Out of scope
Changing write-route CORS behavior (no CORS headers on writes stays).
