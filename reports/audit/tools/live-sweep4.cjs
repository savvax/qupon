#!/usr/bin/env node
// Round 4 (task 91567): /bonds filter chips, registrar detail ru, activity ru — retried after
// round-3 timeouts (the deployment stalled twice mid-run).
const { chromium } = require("@playwright/test");
const SITE = "https://qupon.85-192-29-7.sslip.io";

async function attempt(browser, label, fn, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try { return await fn(i); }
    catch (e) { console.log(`${label} attempt ${i} failed: ${String(e).split("\n")[0].slice(0, 140)}`); }
  }
  console.log(`${label}: GAVE UP`);
}

(async () => {
  const browser = await chromium.launch();

  await attempt(browser, "bonds chips", async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`${SITE}/bonds`, { waitUntil: "networkidle", timeout: 60_000 });
    const chips = await p.evaluate(() =>
      [...document.querySelectorAll("button, a")].filter((el) => /^(Active|All)$/i.test(el.textContent?.trim() ?? "")).map((el) => ({ tag: el.tagName, text: el.textContent?.trim(), href: el.getAttribute("href") })));
    console.log("CHIPS:", JSON.stringify(chips));
    for (const c of chips.filter((c) => /^all$/i.test(c.text ?? ""))) {
      if (c.tag === "A" && c.href) await p.goto(c.href, { waitUntil: "networkidle", timeout: 60_000 });
      else await p.getByText(/^All$/).click();
      await p.waitForTimeout(2500);
      const t = await p.evaluate(() => document.body.innerText);
      console.log(`after All: Astana-Metro=${/Astana-Metro/.test(t)} Closed=${/Closed/.test(t)} rows=${(t.match(/KZ2C0QPN\d{4}/g) ?? []).join(",")}`);
    }
    await p.close(); await ctx.close();
  });

  for (const [route, locale, width, dump] of [
    ["/registrar/actions/HoEwnW6oJSNgLjV2w5XViG4cY9RqUCmqdySDRpXCGFCu", "ru", 390, true],
    ["/registrar/activity", "ru", 1440, true],
  ]) {
    await attempt(browser, `${route} ${locale}`, async () => {
      const ctx = await browser.newContext();
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: locale, url: SITE }]);
      const p = await ctx.newPage();
      await p.goto(`${SITE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await p.getByRole("button", { name: /registrar/i }).click();
      await p.waitForTimeout(3500);
      await p.setViewportSize({ width, height: width > 500 ? 900 : 844 });
      await p.goto(SITE + route, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await p.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      await p.waitForTimeout(4000);
      const text = await p.evaluate(() => document.body.innerText);
      if (dump) console.log(`\n===== DUMP ${route} [${locale} ${width}] =====\n${text.slice(0, 3200)}\n===== END`);
      await p.close(); await ctx.close();
    });
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
