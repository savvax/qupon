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

/** Pacing floor/ceiling per endpoint: api.devnet refills ~1 req/s per IP, so pacing it faster (the old
 *  700 ms) only buys 429s whose adaptive doubling costs more than the requests saved (91579 r1). */
const MIN_INTERVAL = 1000;
const MAX_INTERVAL = 4000;
/** OnFinality's public lane tolerates ~0.5 req/s — pacing it from 700 ms just earns a 429 storm (91579 r1). */
const floorInterval = (url: string) =>
  url.includes("onfinality") ? 2000 : MIN_INTERVAL;
/** OnFinality's public lane keeps no devnet history: `getTransaction` answers null and
 *  `getSignaturesForAddress` answers `[]` — a success that would silently truncate the walk.
 *  History reads therefore never go there (probe, 2026-10-12; task 91579). */
const servesHistory = (url: string) => !url.includes("onfinality");
const HISTORY_METHODS = new Set(["getTransaction", "getSignaturesForAddress"]);
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
    interval: floorInterval(url),
    tail: Promise.resolve() as Promise<unknown>,
  }));
  // SSRF guard: lanes come from the RPC_ENDPOINTS constant or build-time env — allow https only.
  for (const { url } of lanes) {
    let protocol = "";
    try {
      protocol = new URL(url).protocol;
    } catch {
      // malformed env URL — the guard below rejects it with a clear message
    }
    if (protocol !== "https:")
      throw new Error(`non-https RPC endpoint: ${url}`);
  }
  // A lane is a serial queue: waiters chain on `tail`, so N concurrent requests space out at
  // `interval` instead of waking from the same sleep and firing as a herd (a herd is a guaranteed
  // 429 burst on a public node — measured, task 91579 r1).
  const sendOn = (lane: (typeof lanes)[number], payload: unknown) => {
    const run = lane.tail.then(async () => {
      await sleep(Math.max(0, lane.nextSendAt - Date.now()));
      lane.nextSendAt = Date.now() + lane.interval;
      // SAFETY: no user input reaches this URL — lanes come from the RPC_ENDPOINTS constant or the
      // build-time NEXT_PUBLIC_RPC_URLS env, and this fetch runs in the visitor's browser, not on a server.
      const res = await fetch(lane.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: wireJson(payload),
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });
      const json = (await res.json()) as { error?: unknown };
      if (!res.ok || json.error != null) throw new Error(`HTTP ${res.status}`);
      lane.interval = Math.max(
        floorInterval(lane.url),
        Math.round(lane.interval * 0.9),
      );
      setAnsweredBy(lane.url);
      return json as never;
    });
    lane.tail = run.catch(() => undefined); // keep the queue alive after a failed request
    return run;
  };
  return createSolanaRpcFromTransport(async ({ payload }) => {
    let lastErr: unknown;
    // Each transport call tries every endpoint at most once (chain.ts retries the rest with backoff).
    const isHistory = HISTORY_METHODS.has(
      (payload as { method?: string }).method ?? "",
    );
    for (const lane of [...lanes].sort((a, b) => a.nextSendAt - b.nextSendAt)) {
      if (isHistory && !servesHistory(lane.url)) continue; // would answer null/[] as success
      try {
        return await sendOn(lane, payload);
      } catch (e) {
        lastErr = e;
        lane.interval = Math.min(MAX_INTERVAL, lane.interval * 2); // a refusing node gets gentler pacing
      }
    }
    throw lastErr;
  });
}
