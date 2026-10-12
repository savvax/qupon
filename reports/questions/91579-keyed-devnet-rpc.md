# 91579 — keyed devnet RPC needed for "/proof < 15 s"

Task 91579 targeted "All checks pass" < 15 s on public devnet RPC for the biggest proof mint (46 txs).
Measured today from this machine (curl probes + the Playwright timing harness):

- `api.devnet.solana.com`: ~1 `getTransaction`/s sustained per IP, burst ≈ 16 entries, JSON-RPC
  batches count **per entry** (-32029/-32601 style refusals), then HTTP 429 and connection drops.
- `solana-devnet.api.onfinality.io/public` (the only other working keyless devnet endpoint found;
  publicnode's devnet URL now 404s, drpc/ankr/helius need keys, omniatech/solanafrog are down):
  ~0.5 req/s and it rejects batched requests outright.

46 transactions + ~8 account reads therefore cannot finish under ~35–40 s from a single IP on
keyless public endpoints, regardless of client-side parallelism/batching. The page is now correct
under multi-endpoint conditions (null-serve retry, adaptive pacing) and shows progress + ETA.

**Decision needed (owner):** provide a free-tier keyed devnet RPC (e.g. Helius free plan) and wire it
into the VPS deployment. Options:

1. `NEXT_PUBLIC_RPC_URLS=<keyed-url>,https://api.devnet.solana.com` — simplest, but the key is
   inlined into the public JS bundle, which the 91571-5 decision forbids ("keyless public endpoints
   only"). A devnet-only free key is low-stakes, but it is a rule exception only the owner can take.
2. A tiny same-origin proxy route on the web server that injects the key server-side (key stays
   secret; the static `build:proof` export keeps using the keyless public endpoints).

**Default taken:** stay keyless (current committed behavior); judges see progress + ETA and the
walk settles in ~40–60 s from a fresh IP.
