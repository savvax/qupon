#!/usr/bin/env node
// Phase D: does /proof still verify during an API/RPC-provider outage? (task 91580)
module.paths.push("/Users/dev/code/hackatons/kase/qupon-kit/apps/web/node_modules");
const { chromium } = require("@playwright/test");
const fs = require("fs");
const SITE = "https://qupon.185-216-25-91.sslip.io";
const OUT = __dirname + "/../shots/new-server";
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 140)); });
  const t0 = Date.now();
  await p.goto(`${SITE}/proof/E4EHdADP27wBY82ZxyNZPXcH6Rb1jPLQyuociampkFuD`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  let passAt = null;
  while (Date.now() - t0 < 300_000) {
    await p.waitForTimeout(10_000);
    const t = await p.evaluate(() => document.body.innerText);
    if (/All checks pass/i.test(t)) { passAt = ((Date.now() - t0) / 1000).toFixed(0); break; }
  }
  await p.screenshot({ path: `${OUT}/05-proof-E4EHdA-outage.jpg`, type: "jpeg", quality: 60 });
  console.log(`proof during outage: ${passAt ? `All checks pass at +${passAt}s` : "NOT passed in 300s"}; consoleErrors=${[...new Set(errs)].slice(0, 3).join(" | ") || "none"}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
