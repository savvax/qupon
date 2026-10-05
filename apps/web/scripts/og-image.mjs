// Regenerates src/app/opengraph-image.png (1200x630) from the landing hero.
// Usage: start the dev server (mock mode ok), then `pnpm og`.
import { chromium } from "@playwright/test";

const base = process.env.OG_BASE_URL ?? "http://localhost:3210";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
});
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector("h1");
await page.screenshot({
  path: "src/app/opengraph-image.png",
  clip: { x: 0, y: 0, width: 1200, height: 630 },
});
await browser.close();
console.log("wrote src/app/opengraph-image.png");
