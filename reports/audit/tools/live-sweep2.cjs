#!/usr/bin/env node
// Round 2 (task 91567): clean per-route verification — a fresh page per route so network failures
// and console errors cannot bleed between entries (round 1 kept listeners attached).
const { chromium } = require("@playwright/test");
const SITE = "https://qupon.85-192-29-7.sslip.io";

const PUBLIC = [
  ["/bonds", "board text"],
  ["/bonds/GKRsSH9vkqAdKcVsHY8aAhUGUt5iAGPSarRTWBFrR93k", "closed showcase dossier"],
  ["/proof/7MBQ7yA7CBgktQZ5k9GCwHPcWtMANUhJgQHCRrXzC35F", "verifier"],
  ["/proof/E4EHdADP27wBY82ZxyNZPXcH6Rb1jPLQyuociampkFuD", "verifier"],
];

async function one(browser, { route, locale = "en", width = 1440, role, dump = false, settle = 6000 }) {
  const ctx = await browser.newContext({ locale });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: locale, url: SITE }]);
  const page = await ctx.newPage();
  const errs = [], failed = [];
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("Failed to load resource")) errs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errs.push(`pageerror ${String(e).slice(0, 150)}`));
  page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 120)}`); });
  if (role) {
    await page.goto(`${SITE}/login`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: new RegExp(role, "i") }).click();
    await page.waitForTimeout(3000);
  }
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.goto(SITE + route, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(settle);
  const data = await page.evaluate(() => ({
    url: location.pathname,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    text: document.body.innerText,
  }));
  if (dump) console.log(`\n===== TEXT DUMP ${route} [${locale} ${width}] =====\n${data.text.slice(0, 3500)}\n===== END DUMP`);
  const uniq = [...new Set(failed)];
  console.log(`${role ? role + ": " : ""}${route} [${locale} ${width}] → ${data.url} overflow=${data.overflow} errors=${errs.length} failed=${uniq.length}`);
  for (const e of errs.slice(0, 5)) console.log("   err:", e);
  for (const f of uniq.slice(0, 8)) console.log("   fail:", f);
  await page.close();
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  for (const [route, why] of PUBLIC) {
    console.log(`\n### ${why}`);
    await one(browser, { route, dump: true });
    await one(browser, { route, locale: "ru", dump: route.includes("bonds/G") });
    await one(browser, { route, locale: "kk" });
    await one(browser, { route, width: 390 });
  }
  console.log("\n### registrar detail HoEwn (ru/kk 390) — English leak check");
  await one(browser, { route: "/registrar/actions/HoEwnW6oJSNgLjV2w5XViG4cY9RqUCmqdySDRpXCGFCu", role: "registrar", locale: "ru", width: 390, dump: true, settle: 4000 });
  await one(browser, { route: "/registrar/actions/HoEwnW6oJSNgLjV2w5XViG4cY9RqUCmqdySDRpXCGFCu", role: "registrar", locale: "kk", width: 390, settle: 4000 });
  console.log("\n### registrar activity (ru) — enum leak check");
  await one(browser, { route: "/registrar/activity", role: "registrar", locale: "ru", dump: true, settle: 4000 });
  console.log("\n### registrar actions detail FyB4 (en) — why flagged");
  await one(browser, { route: "/registrar/actions/FyB4aq5iu8HFNbw8VTZoH4up2mKzfBQ2fM1hgowjpPVE", role: "registrar", settle: 4000 });
  console.log("\n### issuer series new (ru 390)");
  await one(browser, { route: "/issuer/series/new", role: "issuer", locale: "ru", width: 390, settle: 3000 });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
