#!/usr/bin/env node
// Round 3 (task 91567): last targeted checks — English leaks on registrar detail ru/kk, activity
// enums ru, /bonds "All" chip, holder page, proof sub-check completion after 45 s, admin logged out.
const { chromium } = require("@playwright/test");
const SITE = "https://qupon.85-192-29-7.sslip.io";

async function one(browser, { route, locale = "en", width = 1440, role, dump = false, settle = 5000 }) {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: locale, url: SITE }]);
  const page = await ctx.newPage();
  const errs = [], failed = [];
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("Failed to load resource")) errs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errs.push(`pageerror ${String(e).slice(0, 150)}`));
  page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 120)}`); });
  try {
    if (role) {
      await page.goto(`${SITE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.getByRole("button", { name: new RegExp(role, "i") }).click();
      await page.waitForTimeout(3000);
    }
    await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
    const resp = await page.goto(SITE + route, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch((e) => null);
    await page.waitForLoadState("networkidle", { timeout: 25_000 }).catch(() => {});
    await page.waitForTimeout(settle);
    const data = await page.evaluate(() => ({
      url: location.pathname,
      status: document.title,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      text: document.body.innerText,
      holderLinks: [...document.querySelectorAll('a[href*="/holder/"]')].map((a) => a.getAttribute("href")).slice(0, 3),
    }));
    if (dump) console.log(`\n===== DUMP ${route} [${locale} ${width}] =====\n${data.text.slice(0, 3000)}\n===== END`);
    console.log(`${role ? role + ": " : ""}${route} [${locale} ${width}] http=${resp?.status()} → ${data.url} overflow=${data.overflow} errs=${errs.length} failed=${[...new Set(failed)].length} holders=${data.holderLinks.join(",")}`);
    for (const e of errs.slice(0, 4)) console.log("   err:", e);
    for (const f of [...new Set(failed)].slice(0, 6)) console.log("   fail:", f);
  } catch (e) {
    console.log(`${route} [${locale}] HARD-FAIL ${String(e).slice(0, 160)}`);
  }
  await page.close();
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  console.log("### /bonds All chip");
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(`${SITE}/bonds`, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
  await p.getByRole("button", { name: /^All$/ }).click().catch(async (e) => console.log("All chip click:", String(e).slice(0, 80)));
  await p.waitForTimeout(2500);
  const all = await p.evaluate(() => document.body.innerText.slice(0, 2200));
  console.log("ALL-chip rows mention Astana-Metro:", /Astana-Metro/.test(all), "| Closed:", /Closed/.test(all));
  await p.close(); await ctx.close();

  await one(browser, { route: "/registrar/actions/HoEwnW6oJSNgLjV2w5XViG4cY9RqUCmqdySDRpXCGFCu", role: "registrar", locale: "ru", width: 390, dump: true, settle: 4000 });
  await one(browser, { route: "/registrar/activity", role: "registrar", locale: "ru", dump: true, settle: 4000 });
  await one(browser, { route: "/registrar/actions/FyB4aq5iu8HFNbw8VTZoH4up2mKzfBQ2fM1hgowjpPVE", role: "registrar", settle: 4000 });
  console.log("\n### holder page (from closed dossier links)");
  await one(browser, { route: "/holder/6g4FVaCGzN4RcLw6w5oJDJtqwbwqwbDkHP7tPZ4F9rdC", locale: "ru", settle: 4000 });
  console.log("\n### admin logged out");
  await one(browser, { route: "/admin", settle: 2000 });
  console.log("\n### proof sub-checks after 45 s");
  await one(browser, { route: "/proof/7MBQ7yA7CBgktQZ5k9GCwHPcWtMANUhJgQHCRrXzC35F", settle: 45000, dump: true });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
