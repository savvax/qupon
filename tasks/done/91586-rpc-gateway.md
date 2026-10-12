---
id: 91586
title: in-process devnet RPC gateway — pace, cache, dedupe and absorb 429 for the registrar and every CLI run
agent: glm
tier: T1
depends_on: [1540]
verify: make verify
timeout_min: 150
---
## Goal
Run the demo on public devnet (`https://api.devnet.solana.com`) with no third-party RPC. Public devnet limits per IP
(Solana docs, clusters): 100 requests / 10 s, 40 / 10 s for a single method, 40 concurrent connections, 40 new
connections / 10 s, 100 MB / 30 s. Today the registrar (Go) and every `qupon` CLI run it spawns (Node, one process per
step, new TLS connections each time) hit devnet independently: a judge's sandbox logs ~130 × `Connection rate limits
exceeded` / `Too many requests for a specific RPC call` per minute and coupon 1 is not paid within 7 min.

Fix: one local JSON-RPC gateway inside the registrar process. Everything (chain client, ingest poller, CLI subprocesses)
talks to it on 127.0.0.1; only the gateway talks to devnet — over a few kept-alive connections, paced under the limits,
with a short cache and in-flight dedupe, retrying 429 itself so callers only ever see latency.

## Do
1. New package `services/registrar/internal/rpcgw` — `New(upstream string, log *slog.Logger) *Gateway`, `ListenAndServe(ctx, addr)`.
   - **Upstream:** one `http.Client` with keep-alive (`MaxConnsPerHost` 4, `MaxIdleConnsPerHost` 4); never log the
     upstream URL (it may carry `?api-key=`) — reuse `chain.NewRPC`'s redaction idea or log the host only.
   - **Pacing:** token buckets (`golang.org/x/time/rate` only if already in go.mod, else a small ticker/mutex bucket):
     total 8 req/s burst 16; per method 3.5 req/s burst 8. Over-budget requests WAIT (FIFO) until a token or the caller's
     context ends — never answer 429 to a caller.
   - **Cache + singleflight** (key = method + canonical params JSON; only successful `result`s are cached; identical
     concurrent requests share one upstream call). TTLs:
     `getAccountInfo, getMultipleAccounts, getProgramAccounts, getBalance, getTokenAccountBalance,
     getTokenAccountsByOwner, getTokenLargestAccounts, getSignaturesForAddress` 1.5 s;
     `getLatestBlockhash, getSlot, getBlockHeight, getEpochInfo` 1 s;
     `getTransaction` 10 min but only non-null results (bounded, e.g. 2000 entries);
     `getMinimumBalanceForRentExemption, getGenesisHash, getVersion` 10 min.
     Never cache: `sendTransaction, simulateTransaction, requestAirdrop, getSignatureStatuses` and any unknown method
     (pass through, still paced and singleflighted where identical).
   - **Freshness:** every `sendTransaction` that returns a result clears the account-state caches (all 1.5 s methods)
     — the CLI's next read after its own write must not see pre-write state.
   - **Ids:** a cached/shared answer is re-wrapped with the CALLER's `id` (`{"jsonrpc":"2.0","id":<caller id>,"result":…}`).
     JSON-RPC batch bodies (arrays) are passed through uncached, costing one token per element.
   - **429:** upstream HTTP 429 or a JSON-RPC error with code 429 → a gateway-wide cool-down (1 s doubling to 8 s, ±25 %
     jitter, reset after a success) during which no upstream request starts; then retry the same request (up to 5
     tries within the caller's deadline). Other upstream errors are returned to the caller unchanged.
   - **Stats:** every 60 s one log line `rpc gateway` with upstream calls, cache hits, singleflight shares, 429s,
     max queue wait, top 5 methods by upstream calls.
2. Wiring `services/registrar/cmd/registrar/main.go`: when env `RPC_GATEWAY=1`, start the gateway on `RPC_GATEWAY_ADDR`
   (default `127.0.0.1:8899`) with upstream `cfg.RPCURL` BEFORE the chain client / poller / executor are built; then set
   `cfg.RPCURL` to `http://<addr>` and `os.Setenv("RPC_URL", …)` + `os.Setenv("RPC_FALLBACK_URL", …)` so CLI subprocesses
   (they inherit `os.Environ()` in `internal/executor`) and their status fallback (`clients/ts/src/lib/tx.ts`
   `statusFallbackUrl`) go through it. `internal/ingest/ingest.go:64` creates a direct public-devnet fallback whenever
   `rpcURL != rpc.DevNet_RPC` — that must not bypass the gateway (no fallback when the gateway is on, or point it at the
   gateway). The startup log keeps printing the redacted real upstream. Gateway off (`RPC_GATEWAY` unset) = today's
   behaviour exactly.
3. `ops/deploy-vps.sh`: write `RPC_GATEWAY=1` into registrar.env next to `AUTOFUND=1` (one comment line).
4. Tests (`internal/rpcgw`, httptest upstream): cache hit answers with the caller's id and makes no upstream call;
   N concurrent identical requests → 1 upstream call; `sendTransaction` clears the `getAccountInfo` cache;
   upstream HTTP 429 and JSON-RPC 429 are retried after the cool-down and the caller gets the result; pacing (shrink
   the rates via an unexported option) — 10 requests at 5 req/s take ≥ ~1.5 s; null `getTransaction` is not cached;
   unknown methods pass through. Keep every existing test green. `golangci-lint` clean.
5. Worklog: measured upstream calls per minute with the gateway (fake upstream or a short devnet run if you have one —
   do NOT use the production servers), and anything a reviewer should watch.

## Constraints
Pre-submission reliability fix (deadline 2026-10-13 11:59 Almaty): registrar + deploy script only; no program, web or
CLI code changes (the CLI already reads `RPC_URL`/`RPC_FALLBACK_URL`); devnet only; never print the RPC URL or key;
do not deploy; never name other hackathon participants. If task 91585 (shared cool-down in `chain.Client`) is merged
first, keep it — the gateway is in front of it, not a replacement.

## Finish
Commit `feat(registrar): in-process devnet RPC gateway (pace, cache, dedupe, absorb 429)` (`task: 91586`), write
`reports/worklog/91586.md`, print `DONE:91586` or `BLOCKED:91586 <reason>`.
