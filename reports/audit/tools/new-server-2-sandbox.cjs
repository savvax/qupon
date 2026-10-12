#!/usr/bin/env node
// Phase B: judge sandbox walkthrough on the new server (task 91580).
// Creates sandbox #1 via the public "Try it in 3 minutes" UI and follows it to coupon 1,
// then every scenario button, then maturity/close. Long-running; logs to stdout.
module.paths.push("/Users/dev/code/hackatons/kase/qupon-kit/apps/web/node_modules");
const { chromium } = require("@playwright/test");
const fs = require("fs");

const SITE = "https://qupon.185-216-25-91.sslip.io";
const OUT = __dirname + "/../shots/new-server";
const state = { events: [], txLinks: new Set() };
const log = (t, msg) => { state.events.push(`${new Date().toISOString()} +${((Date.now() - t0) / 1000).toFixed(0)}s ${msg}`); console.log(msg); };
const t0 = Date.now();

async function shot(page, name, quality = 70) {
  const path = `${OUT}/${name}.jpg`;
  await page.screenshot({ path, type: "jpeg", quality });
  if (fs.statSync(path).size > 300_000) await page.screenshot({ path, type: "jpeg", quality: 40 });
  return `${(fs.statSync(path).size / 1024).toFixed(0)}KB`;
}

function watch(page) {
  page.on("console", (m) => { if (m.type() === "error") log(t0, `[console.error] ${m.text().slice(0, 180)}`); });
  page.on("response", (r) => {
    const u = r.url();
    const m = u.match(/explorer\.solana\.com\/tx\/([1-9A-HJ-NP-Za-km-z]+)/);
    if (m) state.txLinks.add(m[1]);
    if ((u.startsWith(SITE) || u.includes("api.185-216")) && r.status() >= 400) log(t0, `[http ${r.status()}] ${u.slice(0, 130)}`);
  });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  watch(page);

  // 1) Landing → "Try it in 3 minutes"
  await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);
  console.log(await shot(page, "10-landing-cta"));
  const cta = page.getByRole("link", { name: /Try it in 3 minutes/i }).first();
  await cta.click();
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  log(t0, `on ${page.url()} after CTA`);

  // 2) Create the sandbox (the click-through on /sandbox/new)
  const create = page.getByRole("button", { name: /create|start|issue/i }).first();
  let created = false;
  const createT0 = Date.now();
  try {
    await create.click({ timeout: 8_000 });
    created = true;
    log(t0, `create clicked (HTTP timing below), waiting for redirect…`);
  } catch {
    log(t0, `no create button found on ${page.url()}; page text:\n${(await page.evaluate(() => document.body.innerText)).slice(0, 600)}`);
  }
  // wait for navigation to /sandbox/<id>
  await page.waitForURL(/\/sandbox\/[A-Za-z0-9]+/, { timeout: 180_000 }).catch(async () => {
    log(t0, `no redirect after create; text: ${(await page.evaluate(() => document.body.innerText)).slice(0, 400)}`);
  });
  const sandboxId = (page.url().match(/\/sandbox\/([A-Za-z0-9]+)/) || [])[1];
  log(t0, `sandbox id=${sandboxId} create→ready ${((Date.now() - createT0) / 1000).toFixed(1)}s`);
  console.log(await shot(page, "11-sandbox-waiting"));

  // 3) Poll the sandbox life until coupon 1 Completed (announce → snapshot → pay)
  const marks = {};
  const tLimit = Date.now() + 60 * 60 * 1000; // 1h hard cap for the whole run
  let couponPaid = false;
  while (Date.now() < tLimit) {
    await page.waitForTimeout(15_000);
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(3000);
    const text = await page.evaluate(() => document.body.innerText);
    for (const [key, re] of Object.entries({
      announced: /Announced|announce/i, snapshot: /Snapshot|snapshot/i, funding: /Funded|funding/i,
      paid: /Completed|Paid|paid/i,
    })) {
      if (!marks[key] && re.test(text)) { marks[key] = ((Date.now() - t0) / 1000).toFixed(0); log(t0, `mark ${key} at +${marks[key]}s`); }
    }
    if (/500\.00|1,?250\.00/.test(text) && /Completed/i.test(text)) {
      couponPaid = true;
      log(t0, `COUPON 1 PAID with entitlement numbers at +${((Date.now() - t0) / 1000).toFixed(0)}s`);
      console.log(await shot(page, "12-sandbox-coupon-paid"));
      break;
    }
    if (/failed|error/i.test(text) && !/0 errors/i.test(text)) {
      // keep polling but note it once
      if (!marks.errSeen) { marks.errSeen = 1; log(t0, `page mentions failure text: ${text.slice(0, 200).replace(/\n/g, " ")}`); }
    }
  }
  if (!couponPaid) log(t0, `coupon NOT paid within 1h — stopping poll`);

  // 4) Scenario buttons on the sandbox page (DvP trade, non-KYC transfer, default/skip funding…)
  const scenarioText = await page.evaluate(() => document.body.innerText);
  const buttons = await page.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).filter((t) => t.length > 3));
  log(t0, `buttons on page: ${JSON.stringify([...new Set(buttons)].slice(0, 25))}`);
  for (const label of ["DvP", "transfer", "non-KYC", "default", "skip"]) {
    const btn = page.getByRole("button", { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
    if (await btn.isVisible().catch(() => false)) {
      const before = page.url();
      try {
        await btn.click({ timeout: 5_000 });
        await page.waitForTimeout(8_000);
        log(t0, `scenario "${label}" clicked → ${page.url() === before ? "same page" : page.url()}`);
        console.log(await shot(page, `13-scenario-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`));
        const t = await page.evaluate(() => document.body.innerText);
        const dl = (t.match(/explorer\.solana\.com\/tx\/[1-9A-HJ-NP-Za-km-z]+/g) || []).length;
        log(t0, `  after "${label}": txLinks on page=${dl}; snippet=${t.slice(0, 220).replace(/\n/g, " | ")}`);
      } catch (e) { log(t0, `scenario "${label}" click failed: ${String(e).split("\n")[0].slice(0, 100)}`); }
    } else {
      log(t0, `scenario button "${label}" not visible`);
    }
  }

  // 5) Maturity / close: poll up to 25 more minutes
  const matLimit = Date.now() + 25 * 60 * 1000;
  let closed = false;
  while (Date.now() < matLimit) {
    await page.waitForTimeout(20_000);
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(3000);
    const text = await page.evaluate(() => document.body.innerText);
    if (/(Redeemed|redeemed|Closed|closed|maturity|Maturity)/.test(text) && /10[,.\s]?000/i.test(text)) {
      closed = true;
      log(t0, `MATURITY/CLOSED seen at +${((Date.now() - t0) / 1000).toFixed(0)}s`);
      console.log(await shot(page, "14-sandbox-maturity"));
      break;
    }
  }
  if (!closed) log(t0, `maturity NOT reached within +25min window (sandbox may need longer; noted)`);

  fs.writeFileSync("/tmp/ns-results-b.json", JSON.stringify({ sandboxId, url: page.url(), marks, couponPaid, closed, events: state.events, txLinks: [...state.txLinks] }, null, 2));
  await browser.close();
  console.log("SANDBOX_ID:", sandboxId);
})().catch((e) => { console.error(e); process.exit(1); });
