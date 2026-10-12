// Task 91579: time /proof/<mint> from page load to "All checks pass" on a production build
// against the real public devnet RPC (the judge's experience). Prints JSON: one row per demo
// mint — seconds to the verdict and how many RPC answers came back 429.
// Usage: pnpm --filter @qupon/web build && node scripts/proof-timing.mjs
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PROOF_TIMING_PORT ?? 3299);
const BASE = `http://localhost:${PORT}`;
const MINTS = [
  ["plan15-28tx", "7MBQ7yA7CBgktQZ5k9GCwHPcWtMANUhJgQHCRrXzC35F"],
  ["legacy-46tx", "E4EHdADP27wBY82ZxyNZPXcH6Rb1jPLQyuociampkFuD"],
];

const server = spawn("pnpm", ["start"], {
  cwd: new URL("..", import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT) },
  stdio: "ignore",
  detached: true,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ready() {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${BASE}/proof/`);
      if (res.ok) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`server not ready on ${BASE}`);
}

const browser = await chromium.launch();
const rows = [];
try {
  await ready();
  for (const [name, mint] of MINTS) {
    const page = await browser.newPage();
    const rateLimited = [];
    page.on("response", (r) => {
      if (r.status() === 429) rateLimited.push(new URL(r.url()).host);
    });
    const t0 = Date.now();
    await page.goto(`${BASE}/proof/${mint}`, { waitUntil: "domcontentloaded" });
    await page
      .getByTestId("proof-verdict")
      .filter({ hasText: "All checks pass" })
      .waitFor({ timeout: 240_000 });
    rows.push({
      name,
      seconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
      http429: rateLimited.length,
    });
    await page.close();
  }
} finally {
  await browser.close().catch(() => {});
  if (server.pid) process.kill(-server.pid, "SIGTERM");
}
console.log(JSON.stringify(rows));
