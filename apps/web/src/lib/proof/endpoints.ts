/**
 * Devnet RPC endpoints for the in-browser verifier (A91571-5): a request that the first endpoint refuses is
 * retried once against the next one, and the certificate shows which endpoint answered. Keyless public
 * endpoints only — NEXT_PUBLIC_* is inlined into the bundle, so never a keyed URL here. Override with
 * NEXT_PUBLIC_RPC_URLS (comma-separated).
 */
import {
  createSolanaRpcFromTransport,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import { wireJson } from "./rpcKey";

export const RPC_ENDPOINTS = (
  process.env.NEXT_PUBLIC_RPC_URLS ??
  "https://api.devnet.solana.com,https://solana-devnet-rpc.publicnode.com"
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

/**
 * RPC client with endpoint fallback: a request the first endpoint refuses (rate limit, 5xx, JSON-RPC error)
 * is retried against the next one; `answeredByRpc` reports who answered (A91571-5).
 */
export function createProofRpc(
  endpoints: readonly string[] = RPC_ENDPOINTS,
): Rpc<SolanaRpcApi> {
  return createSolanaRpcFromTransport(async ({ payload }) => {
    let lastErr: unknown;
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: wireJson(payload),
        });
        const json = (await res.json()) as { error?: unknown };
        if (!res.ok || json.error != null)
          throw new Error(`HTTP ${res.status}`);
        setAnsweredBy(url);
        return json as never;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  });
}
