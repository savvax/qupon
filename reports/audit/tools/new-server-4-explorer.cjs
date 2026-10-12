#!/usr/bin/env node
// Explorer spot-check: open 3 tx links from the passing proof certificate (task 91580).
module.paths.push("/Users/dev/code/hackatons/kase/qupon-kit/apps/web/node_modules");
const { chromium } = require("@playwright/test");

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto("https://qupon.185-216-25-91.sslip.io/proof/7MBQ7yA7CBgktQZ5k9GCwHPcWtMANUhJgQHCRrXzC35F", { waitUntil: "domcontentloaded", timeout: 60_000 });
  let links = [];
  for (let i = 0; i < 30 && links.length < 3; i++) {
    await p.waitForTimeout(5000);
    links = await p.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="explorer.solana.com/tx/"]')].map((a) => a.getAttribute("href")))]);
  }
  console.log("tx links found on proof page:", links.length, "all devnet-cluster:", links.every((l) => l.includes("cluster=devnet")));
  links.slice(0, 3).forEach((l) => console.log("LINK", l));
  let i = 1;
  for (const l of links.slice(0, 3)) {
    const t = await ctx.newPage();
    try {
      await t.goto(l, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await t.waitForTimeout(6000);
      const txt = await t.evaluate(() => document.body.innerText);
      const sig = l.split("/tx/")[1].split("?")[0];
      console.log("explorer check", i, ":", t.url().slice(0, 70), "| page shows sig:", txt.includes(sig.slice(0, 16)), "| len", txt.length);
      await t.screenshot({ path: "reports/audit/shots/new-server/30-explorer-tx" + i + ".jpg", type: "jpeg", quality: 60 });
    } catch (e) { console.log("explorer check", i, "FAILED", String(e).split("\n")[0].slice(0, 120)); }
    i++;
    await t.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
