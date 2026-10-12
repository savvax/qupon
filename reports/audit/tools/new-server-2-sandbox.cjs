#!/usr/bin/env node
// Phase B2: judge sandbox walkthrough on the new server (task 91580, resumed attempt).
// /sandbox/new auto-creates (idempotent requestId in sessionStorage) and redirects to /sandbox/<id>.
// One civil day per real second: coupon 1 ≈ +3 min, coupon 2 + maturity ≈ +6-7 min.
module.paths.push("/Users/dev/code/hackatons/kase/qupon-kit/apps/web/node_modules");
const { chromium } = require("@playwright/test");
const fs = require("fs");

const SITE = "https://qupon.185-216-25-91.sslip.io";
const OUT = __dirname + "/../shots/new-server";
const state = { events: [], txs: new Set() };
const t0 = Date.now();
const log = (msg) => { state.events.push(`${new Date().toISOString()} +${((Date.now() - t0) / 1000).toFixed(0)}s ${msg}`); console.log(msg); };

async function shot(page, name, quality = 70) {
  const path = `${OUT}/${name}.jpg`;
  await page.screenshot({ path, type: "jpeg", quality });
  if (fs.statSync(path).size > 300_000) await page.screenshot({ path, type: "jpeg", quality: 40 });
  return `${(fs.statSync(path).size / 1024).toFixed(0)}KB`;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") log(`[console.error] ${m.text().slice(0, 160)}`); });
  page.on("response", (r) => {
    const m = r.url().match(/explorer\.solana\.com\/tx\/([1-9A-HJ-NP-Za-km-z]+)/);
    if (m) state.txs.add(m[1]);
    if (r.url().includes("api.185-216") && r.status() >= 400) log(`[http ${r.status()}] ${r.url().slice(0, 120)}`);
  });

  // 1) create (auto on load) → wait for redirect to /sandbox/<id>, up to 6 min
  const gotoT0 = Date.now();
  await page.goto(`${SITE}/sandbox/new`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  log(`on /sandbox/new; auto-create should be running`);
  let redirected = false;
  try {
    await page.waitForURL(/\/sandbox\/[A-Za-z0-9_-]+/, { timeout: 360_000 });
    redirected = true;
  } catch {
    const t = await page.evaluate(() => document.body.innerText).catch(() => "");
    log(`NO redirect in 6 min. Page text: ${t.slice(0, 500).replace(/\n/g, " | ")}`);
  }
  const sandboxId = (page.url().match(/\/sandbox\/([A-Za-z0-9_-]+)/) || [])[1];
  log(`sandbox id=${sandboxId}; create→ready ${redirected ? ((Date.now() - gotoT0) / 1000).toFixed(1) + "s" : "FAILED"}`);
  console.log(await shot(page, "11-sandbox-waiting"));

  const marks = {};
  const mark = (k) => { if (!marks[k]) { marks[k] = ((Date.now() - t0) / 1000).toFixed(0); log(`mark ${k} at +${marks[k]}s`); } };
  const read = async () => { try { return await page.evaluate(() => document.body.innerText); } catch { return ""; } };

  if (redirected) {
    // 2) poll to coupon 1 paid (cap 12 min; whole life is ~7 min)
    let couponPaid = false;
    const cLimit = Date.now() + 12 * 60_000;
    while (Date.now() < cLimit) {
      await page.waitForTimeout(15_000);
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(3500);
      const text = await read();
      if (/Announced|announce/i.test(text)) mark("announced");
      if (/Snapshot/i.test(text)) mark("snapshot");
      if (/Funded|funding|Escrow funded/i.test(text)) mark("funded");
      if (/error|failed/i.test(text) && !/0 errors/i.test(text) && !marks.errSeen) { marks.errSeen = 1; log(`failure text on page: ${text.slice(0, 220).replace(/\n/g, " | ")}`); }
      if (/500[.,]?00/.test(text) && /1[.,]?250[.,]?00/.test(text) && /Completed|Paid/i.test(text)) {
        couponPaid = true;
        mark("coupon1Paid");
        console.log(await shot(page, "12-sandbox-coupon-paid"));
        break;
      }
    }
    if (!couponPaid) log(`coupon 1 NOT confirmed paid in 12 min`);

    // 3) every scenario button, in dependency order: dvp, non-kyc, skip funding (default), cure
    for (const kind of ["dvp_trade", "non_kyc_transfer", "skip_funding", "cure"]) {
      const tile = page.locator(`[data-scenario="${kind}"]`);
      const btn = tile.getByRole("button").first();
      const disabled = await btn.isDisabled().catch(() => true);
      const why = (await tile.locator("span.text-xs").first().textContent().catch(() => "")) || "";
      if (disabled) { log(`scenario ${kind}: button disabled (${why.trim() || "no reason shown"})`); continue; }
      const sT0 = Date.now();
      try {
        await btn.click({ timeout: 8_000 });
        await page.waitForTimeout(10_000);
        const res = (await tile.innerText().catch(() => "")).replace(/\n/g, " | ").slice(0, 300);
        log(`scenario ${kind}: done in ${((Date.now() - sT0) / 1000).toFixed(1)}s → ${res}`);
        console.log(await shot(page, `13-scenario-${kind}`));
      } catch (e) { log(`scenario ${kind} FAILED: ${String(e).split("\n")[0].slice(0, 120)}`); }
    }

    // 4) maturity / close (cap 10 more min)
    let closed = false;
    const mLimit = Date.now() + 10 * 60_000;
    while (Date.now() < mLimit) {
      await page.waitForTimeout(20_000);
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(3500);
      const text = await read();
      if (/REDEEMED|Redeemed/.test(text)) mark("redeemed");
      if (/Closed|closed/.test(text)) mark("closed");
      if ((marks.redeemed || marks.closed) && /10[.,\s]?000/.test(text)) {
        closed = true;
        log(`MATURITY/CLOSED confirmed`);
        console.log(await shot(page, "14-sandbox-maturity"));
        break;
      }
    }
    if (!closed) log(`maturity/close NOT confirmed within window`);
  }

  fs.writeFileSync("/tmp/ns-results-b.json", JSON.stringify({ sandboxId, redirected, marks, events: state.events, txs: [...state.txs] }, null, 2));
  await browser.close();
  console.log("SANDBOX_ID:", sandboxId);
})().catch((e) => { console.error(e); process.exit(1); });
