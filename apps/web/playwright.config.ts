import { defineConfig, devices } from "@playwright/test";

/**
 * Mock mode (default): smoke tests against the mock registrar API
 * (src/mocks/api.ts) — `pnpm e2e` starts/stops the dev server itself, so no Go
 * service or devnet is needed.
 *
 * Live mode: set E2E_BASE_URL (e.g. https://qupon.85-192-29-7.sslip.io) — the
 * tests run against that deployment (no local server), the e2e/live/*.spec.ts
 * specs tagged @live stop skipping, and a run summary is written to
 * reports/e2e-live.md.
 */
const port = Number(process.env.E2E_PORT ?? 3210);
const live = process.env.E2E_BASE_URL;
const reporters: [string][] = [process.env.CI ? ["github"] : ["list"]];
// Live runs also land in reports/e2e-live.md for the demo book.
if (live) reporters.push(["./e2e/live/reporter"]);

export default defineConfig({
  testDir: "./e2e",
  // Outside apps/web: failure artifacts must not wake next dev's watcher mid-run (routes 404).
  outputDir: "/tmp/qupon-e2e-results",
  timeout: 60_000,
  // The UX audit (e2e/ux-audit.spec.ts, task 1106) only runs on request: `pnpm e2e --grep @audit`.
  grepInvert: process.env.AUDIT ? undefined : /@audit/,
  workers: 1, // next dev compiles routes on demand — serial keeps a cold dev server reliable
  retries: process.env.CI ? 1 : 0,
  reporter: reporters,
  use: {
    baseURL: live ?? `http://localhost:${port}`,
    ...devices["Desktop Chrome"],
  },
  // The dev server is only needed in mock mode; live mode exercises the deployment.
  ...(live
    ? {}
    : {
        webServer: {
          command: "pnpm dev",
          // E2E_PORT isolates parallel worktrees (the default 3210 may serve another checkout).
          url: `http://localhost:${port}`,
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
          env: {
            API_MOCKING: "enabled",
            NEXT_PUBLIC_API_MOCKING: "enabled",
            PORT: String(port),
          },
        },
      }),
});
