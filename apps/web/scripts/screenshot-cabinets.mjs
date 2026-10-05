// Task 303: capture the registrar cabinet pages at 1440/390 px in EN and RU.
// Usage: node scripts/screenshot-cabinets.mjs   (starts its own dev server on :3298)
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";

const PORT = 3298;
const BASE = `http://localhost:${PORT}`;
const OUT = "../../reports/ui";

const server = spawn("pnpm", ["dev"], {
  cwd: new URL("..", import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT), API_MOCKING: "enabled" },
  stdio: "ignore",
  detached: true,
});
const up = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${BASE}/login`);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return false;
};

const browser = await chromium.launch();
try {
  if (!(await up())) throw new Error("dev server did not come up");
  for (const locale of ["en", "ru"]) {
    for (const [route, name] of [
      ["/registrar", "registrar-dashboard"],
      ["/registrar/investors", "registrar-investors"],
    ]) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale,
      });
      await context.addCookies([
        { name: "NEXT_LOCALE", value: locale, url: BASE },
      ]);
      const page = await context.newPage();
      await page.request.post(`${BASE}/api/session/demo`, {
        data: { role: "registrar" },
        headers: { "Content-Type": "application/json" },
      });
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      await page.screenshot({
        path: `${OUT}/${name}-${locale}-1440.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      await page.screenshot({
        path: `${OUT}/${name}-${locale}-390.png`,
        fullPage: true,
      });
      await context.close();
    }
  }
  console.log(`screenshots written to ${OUT}`);
} finally {
  await browser.close();
  process.kill(-server.pid, "SIGTERM");
}
