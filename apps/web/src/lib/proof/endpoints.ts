/**
 * Devnet RPC endpoints for the in-browser verifier (A91571-5): requests are paced per endpoint and a request
 * the paced endpoint refuses is retried against the next one, and the certificate shows which endpoint
 * answered. Keyless public endpoints only — NEXT_PUBLIC_* is inlined into the bundle, so never a keyed URL
 * here. Override with NEXT_PUBLIC_RPC_URLS (comma-separated).
 */
import {
  createSolanaRpcFromTransport,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import { wireJson } from "./rpcKey";

export const RPC_ENDPOINTS = (
  process.env.NEXT_PUBLIC_RPC_URLS ??
  "https://api.devnet.solana.com,https://solana-devnet.api.onfinality.io/public"
)
  .split(",")
  .map((s: string) => s.trim())
  .filter(Boolean);

let answeredBy = RPC_ENDPOINTS[0] ?? "";

/** Host of the endpoint that last answered (shown on the proof certificate). */
export const answeredByRpc = () => answeredBy;

/** Remember which endpoint answered the last request (shown on the certificate). */
const setAnsweredBy = (url: string) => {
  answeredBy = url;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pacing floor/ceiling per endpoint (ms between requests): public nodes refill ~1 req/s per IP. */
const MIN_INTERVAL = 700;
const MAX_INTERVAL = 4000;
const FETCH_TIMEOUT = 10_000;

/**
 * RPC client with per-endpoint pacing, rotation and fallback (task 91579). The proof walk keeps several
 * requests in flight; without pacing a single public node 429-storms the page (and drops connections).
 * Each endpoint has an adaptive interval: it doubles when the endpoint refuses (rate limit, 5xx, network)
 * and decays as it keeps answering, and every request takes the endpoint that frees up first, so the two
 * public nodes are used in parallel at whatever rate each one actually tolerates.
 */
export function createProofRpc(
  endpoints: readonly string[] = RPC_ENDPOINTS,
): Rpc<SolanaRpcApi> {
  const lanes = endpoints.map((url) => ({
    url,
    nextSendAt: 0,
    interval: MIN_INTERVAL,
  }));
  return createSolanaRpcFromTransport(async ({ payload }) => {
    let lastErr: unknown;
    // Each transport call tries every endpoint at most once (chain.ts retries the rest with backoff).
    for (const lane of [...lanes].sort((a, b) => a.nextSendAt - b.nextSendAt)) {
      const wait = lane.nextSendAt - Date.now();
      if (wait > 0) await sleep(wait);
      lane.nextSendAt = Math.max(lane.nextSendAt, Date.now()) + lane.interval;
      try {
        // SAFETY: no user input reaches this URL — lanes come from the RPC_ENDPOINTS constant or the
        // build-time NEXT_PUBLIC_RPC_URLS env, and this fetch runs in the visitor's browser, not on a server.
        const res = await fetch(lane.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: wireJson(payload),
          signal: AbortSignal.timeout(FETCH_TIMEOUT),
        });
        const json = (await res.json()) as { error?: unknown };
        if (!res.ok || json.error != null)
          throw new Error(`HTTP ${res.status}`);
        lane.interval = Math.max(MIN_INTERVAL, Math.round(lane.interval * 0.9));
        setAnsweredBy(lane.url);
        return json as never;
      } catch (e) {
        lastErr = e;
        lane.interval = Math.min(MAX_INTERVAL, lane.interval * 2); // a refusing node gets gentler pacing
      }
    }
    throw lastErr;
  });
}
