# 601 — CORS wildcard on public reads (scanner finding)

The pi-lens scanner flags `Access-Control-Allow-Origin: *` (`corsReadOnly`, `services/registrar/internal/api/api.go:284`) as "allows any website to make credentialed requests".

- The line is pre-existing `main` code, byte-identical in this worktree; task 601's api.go diff is one line (the `mountAssets` anchor).
- The scanner's premise does not hold: the middleware never sends `Access-Control-Allow-Credentials`, and the Fetch spec forbids credentialed requests when ACAO is `*` — credentialed cross-origin reads are impossible. Writes get no CORS headers and no `Allow-Headers`, so authenticated cross-origin writes fail preflight; the browser token lives in an httpOnly cookie anyway.
- The wildcard is the documented mechanism (inline comment) serving public devnet state to the investor portal from any origin.

**Decision needed (default = keep as-is):** keep the documented wildcard, or restrict public reads to a configured origin allowlist (needs a new config knob and the list of portal origins). Follow-up task filed as `tasks/todo/9601-cors-origin-policy.md`.
