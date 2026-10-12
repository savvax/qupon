#!/usr/bin/env node
// Task 91587: record one real sandbox run (devnet through the web app's own proxy routes — exactly what
// SandboxStart.tsx does) so /sandbox/replay can play it back with no API and no RPC at view time.
//
//   node apps/web/scripts/record-sandbox.mjs <webAppBaseUrl> [out.json]
//
// <webAppBaseUrl> is the deployed web app (or a local dev server in mock mode for a dry run); the output goes
// to apps/web/public/replay/sandbox.json by default. Polls GET every 2 s and keeps a frame only when the body
// changed (serverTime ignored), runs the two judge scenarios of e2e/live/sandbox.spec.ts after "Coupon 1 paid",
// and stops at that spec's end state: the non-KYC refusal visible in the sandbox body. 20-minute hard cap.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../public/replay/sandbox.json",
);
const POLL_MS = 2_000;
const MAX_MS = 20 * 60_000;

const [base, outArg] = process.argv.slice(2);
if (!base) {
  console.error(
    "usage: node apps/web/scripts/record-sandbox.mjs <apiBaseUrl> [out]",
  );
  process.exit(2);
}
const url = (() => {
  try {
    return new URL(base);
  } catch {
    console.error(`record-sandbox: not a URL: ${base}`);
    return process.exit(2);
  }
})();
const out = resolve(outArg ?? DEFAULT_OUT);
const origin = url.origin;

const die = (msg) => {
  console.error(`record-sandbox: ${msg}`);
  process.exit(1);
};

async function call(method, path, body) {
  const res = await fetch(`${origin}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).catch((e) => die(`${method} ${path}: ${e.message}`));
  if (!res.ok)
    die(
      `${method} ${path}: HTTP ${res.status} ${await res.text().catch(() => "")}`,
    );
  return res.json();
}

// a stable JSON of the body without the fields that change every second
const fingerprint = (sandbox) =>
  JSON.stringify(sandbox, (k, v) =>
    k === "serverTime" || k === "expiresAt" ? undefined : v,
  );

const start = Date.now();
const requestId = crypto.randomUUID();
const created = await call("POST", "/api/bo/demo/sandbox", { requestId }); // same body/scheme as SandboxStart
const id = created.id;
console.error(`recording sandbox ${id} from ${url.host}…`);

const frames = [];
const scenarios = [];
let last = "";
let dvpDone = false;
let kycDone = false;

while (Date.now() - start < MAX_MS) {
  const sandbox = await call("GET", `/api/bo-get/demo/sandbox/${id}`);
  const fp = fingerprint(sandbox);
  if (fp !== last) {
    frames.push({ t: Date.now() - start, sandbox });
    last = fp;
  }
  const coupon1Paid = sandbox.actions?.[0]?.status === "Completed"; // the live e2e's trigger
  const visible = (kind) =>
    (sandbox.scenarios ?? []).some(
      (x) => x.kind === kind && x.signatures?.length,
    );

  // the two judge scenarios, in the live e2e's order and at its moments
  if (coupon1Paid && !dvpDone) {
    scenarios.push({
      t: Date.now() - start,
      scenario: "dvp_trade",
      result: await call("POST", `/api/bo/demo/sandbox/${id}/scenario`, {
        kind: "dvp_trade",
      }),
    });
    dvpDone = true;
  } else if (dvpDone && !kycDone && visible("dvp_trade")) {
    scenarios.push({
      t: Date.now() - start,
      scenario: "non_kyc_transfer",
      result: await call("POST", `/api/bo/demo/sandbox/${id}/scenario`, {
        kind: "non_kyc_transfer",
      }),
    });
    kycDone = true;
  } else if (kycDone && visible("non_kyc_transfer")) {
    // the e2e's end state: the refusal is in the feed
    if (fp === last) frames.push({ t: Date.now() - start, sandbox });
    break;
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}
if (!kycDone)
  die(`the run did not reach its end state within ${MAX_MS / 60_000} min`);

const recording = {
  recordedAt: new Date().toISOString(),
  api: url.host,
  frames,
  scenarios,
};
await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(recording)}\n`);

const sigs = new Set(
  frames.flatMap((f) => (f.sandbox.activity ?? []).map((e) => e.sig)),
);
console.log(
  `recorded ${frames.length} frames, ${((Date.now() - start) / 1000) | 0}s, ` +
    `${sigs.size} tx signatures → ${out}`,
);
