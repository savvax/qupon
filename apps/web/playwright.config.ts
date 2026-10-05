import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests against the mock registrar API (src/mocks/api.ts): the dev
 * server runs with API_MOCKING=enabled, so no Go service or devnet is needed.
 * `pnpm e2e` starts/stops the server itself.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1, // next dev compiles routes on demand — serial keeps a cold dev server reliable
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3210",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3210",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: { API_MOCKING: "enabled", PORT: "3210" },
  },
});
