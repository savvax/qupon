/** JSON with bigints as plain numbers — how Kit puts a request on the wire. */
export const wireJson = (v: unknown) =>
  JSON.stringify(v, (_, x: unknown) => (typeof x === "bigint" ? Number(x) : x));

/** Lookup key of one JSON-RPC request in a recorded fixture (chain.test.ts, e2e/proof.spec.ts). */
export const rpcKey = (method: string, params: unknown) =>
  `${method} ${wireJson(params ?? [])}`;
