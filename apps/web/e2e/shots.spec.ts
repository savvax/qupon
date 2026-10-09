import { test } from "@playwright/test";
import path from "node:path";

// Screenshot helper for the review gate (ops/shots.sh). Skipped unless SHOT_ROUTES is set.
const routes = (process.env.SHOT_ROUTES ?? "").split(/\s+/).filter(Boolean);
const locales = (process.env.SHOT_LOCALES ?? "en ru").split(/\s+/).filter(Boolean);
const out = process.env.SHOT_OUT ?? "/tmp/qupon-shots";
const role = (r: string) =>
  r.startsWith("/registrar") ? "registrar"
  : r.startsWith("/issuer") ? "issuer"
  : r.startsWith("/admin") ? "admin"
  : r.startsWith("/investor") || r.startsWith("/account") ? "investor"
  : null;
const slug = (r: string) => r.replace(/^\//, "").replace(/[^\w-]+/g, "_") || "home";

test.skip(!process.env.SHOT_ROUTES, "set SHOT_ROUTES (see ops/shots.sh)");
for (const r of routes)
  for (const locale of locales)
    for (const width of [1440, 390])
      test(`shot ${r} ${locale} ${width}`, async ({ page, context, baseURL }) => {
        const cookies = [{ name: "NEXT_LOCALE", value: locale, url: baseURL! }];
        const ro = role(r);
        if (ro) cookies.push({ name: "qupon_session", value: `mock:${ro}`, url: baseURL! });
        await context.addCookies(cookies);
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(r, { waitUntil: "networkidle" });
        await page.screenshot({ path: path.join(out, `${slug(r)}-${locale}-${width}.png`), fullPage: true });
      });
