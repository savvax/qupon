#!/usr/bin/env node
// Phase E: final evidence shots during the outage (task 91580): /bonds + one dossier degraded state,
// and ONE /sandbox/new load (the 2nd and last of the ≤2 sandbox budget) to capture what a judge sees
// when the create dies — no retry, close after the shot.
module.paths.push("/Users/dev/code/hackatons/kase/qupon-kit/apps/web/node_modules");
const { chromium } = require("@playwright/test");
const fs = require("fs");
const SITE = "https://qupon.185-216-25-91.sslip.io";
const OUT = __dirname + "/../shots/new-server";

async function shot(p, name, q = 70) {
  await p.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: q });
  const sz = fs.statSync(`${OUT}/${name}.jpg`).size;
  if (sz > 300_000) await p.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 40 });
  return `${(fs.statSync(`${OUT}/${name}.jpg`).size / 1024).toFixed(0)}KB`;
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "en", url: SITE }]);

  // /bonds + closed-series dossier, current degraded state
  for (const [name, path] of [["07-bonds-degraded", "/bonds"], ["07-dossier-closed-degraded", "/bonds/GKRsSH9vkqAdKcVsHY8aAhUGUt5iAGPSarRTWBFrR93k"]]) {
    const p = await ctx.newPage();
    const resp = await p.goto(SITE + path, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
    await p.waitForTimeout(4000);
    const text = await p.evaluate(() => document.body.innerText).catch(() => "");
    console.log(`${path}: HTTP ${resp ? resp.status() : "?"}; unavailable=${/unavailable/i.test(text)}; ${text.length} chars; shot ${await shot(p, name)}`);
    await p.close();
  }

  // ONE /sandbox/new load (auto-create fires; no retry) — what the judge waits through
  const p = await ctx.newPage();
  const t0 = Date.now();
  await p.goto(SITE + "/sandbox/new", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await p.waitForTimeout(60_000);
  await shot(p, "11-sandbox-waiting-60s");
  await p.waitForTimeout(120_000);
  const text = await p.evaluate(() => document.body.innerText).catch(() => "");
  console.log(`/sandbox/new after 180s: url=${p.url()}; failure-card=${/failed|throttl|unavailable/i.test(text)}; elapsed-counter=${/Elapsed|\d+s\b|\d+ s/.test(text)}; shot ${await shot(p, "11-sandbox-waiting-180s")}`);
  console.log(`page text (first 400): ${text.slice(0, 400).replace(/\n/g, " | ")}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
