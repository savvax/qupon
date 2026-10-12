#!/usr/bin/env node
// Round 2 (task 91582): routes round 1 could not reach — showcase dossiers (the /bonds board 500s, so
// links were undiscoverable), a signed-in demo investor (locator clash in round 1), registrar action
// detail, and a quantification of the /login RPC request storm + CORS-failing publicnode RPC.
//   NODE_PATH=/Users/dev/code/hackatons/kase/qupon-kit/apps/web/node_modules node reports/audit/tools/new-server-sweep2.cjs
const { chromium } = require("@playwright/test");
const fs = require("node:fs");

const SITE = "https://qupon.185-216-25-91.sslip.io";
const SHOTS = "reports/audit/shots/new-server-sweep";
const OUT = "/tmp/new-server-sweep2.json";
const pages = [];

const MINTS = ["5tww8A3MXG5VYwabQGoSy7M4wgcXWJMJqu7MhqqQpT34",
  "GKRsSH9vkqAdKcVsHY8aAhUGUt5iAGPSarRTWBFrR93k",
  "E7RgTKWT5VTVKTmscWHgHwSJfjc1TqU9WVkoDjLDxegf",
  "9zunUAFsWDirHhH5JiMDK6k5J16kPG65FYYgVySoDRbL"];

const I18N_KEY = /\b[a-z]{2,12}\.[a-z]{2,12}\.[a-z]{2,12}\b/g;
const BAD = /\b(NaN|undefined|Invalid Date)\b/g;

async function check(page, route, locale, width, settle = 1500) {
  const entry = { route, locale, width, status: null, errors: [], failed: [], overflow: 0,
    brokenImgs: [], i18nKeys: [], bad: [], digest: "" };
  const onConsole = (m) => {
    const t = m.text();
    if (m.type() === "error" && !t.includes("Failed to load resource")) entry.errors.push(t.slice(0, 200));
  };
  page.on("console", onConsole);
  page.on("pageerror", (e) => entry.errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on("response", (r) => {
    if (r.status() >= 400) entry.failed.push(`${r.status()} ${r.url().slice(0, 120)}`);
    if (r.request().isNavigationRequest()) entry.status = r.status();
  });
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  for (let i = 0; i < 3; i++) {
    try { await page.goto(SITE + route, { waitUntil: "domcontentloaded", timeout: 45_000 }); break; }
    catch (e) { if (i === 2) entry.errors.push(`goto: ${String(e).slice(0, 200)}`); else await page.waitForTimeout(3000); }
  }
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(settle);
  try {
    const data = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      text: document.body.innerText.slice(0, 2500),
      imgs: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
      links: [...document.querySelectorAll("a[href]")].map((a) => a.pathname + a.search),
    }));
    entry.overflow = data.overflow;
    entry.brokenImgs = data.imgs;
    const low = ` ${data.text} `;
    entry.i18nKeys = [...new Set(low.match(I18N_KEY) ?? [])].slice(0, 6);
    entry.bad = [...new Set(low.match(BAD) ?? [])];
    entry.digest = data.text.slice(0, 350).replace(/\n/g, " ");
    entry.links = data.links;
  } catch (e) { entry.errors.push(`evaluate: ${String(e).slice(0, 150)}`); }
  const defective = entry.errors.length || entry.overflow > 0 || entry.brokenImgs.length || entry.i18nKeys.length || entry.bad.length;
  if (defective) {
    const file = `${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home"}-${locale}-${width}.jpg`;
    try { await page.screenshot({ path: `${SHOTS}/${file}`, type: "jpeg", quality: 60 }); entry.shot = file; } catch {}
  }
  page.off("console", onConsole);
  pages.push(entry);
  console.log(`${entry.status} ${locale} ${width} ${route}${defective ? " ⚠" : ""} ${entry.bad[0] ?? ""} ${entry.overflow > 0 ? "overflow+" + entry.overflow : ""}`);
  return entry;
}

async function signIn(browser, role) {
  const c = await browser.newContext();
  const p = await c.newPage();
  await p.goto(`${SITE}/login`, { waitUntil: "domcontentloaded" });
  await p.click(`button[name="role"][value="${role}"]`);
  await p.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await p.addInitScript(() => {
    for (const r of ["registrar", "issuer", "investor", "sandbox"]) localStorage.setItem(`qupon.tour.${r}`, "done");
  });
  return [c, p];
}

(async () => {
  const browser = await chromium.launch();

  // Dossiers (public matrix).
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (const locale of ["en", "ru", "kk"]) {
    await ctx.addCookies([{ name: "NEXT_LOCALE", value: locale, url: SITE }]);
    for (const width of [1440, 390]) for (const m of MINTS) await check(page, `/bonds/${m}`, locale, width);
  }

  // Registrar: action detail + notice locale check (A91567-4/5 comparison).
  const [rc, rp] = await signIn(browser, "registrar");
  await rp.goto(`${SITE}/registrar/actions`, { waitUntil: "domcontentloaded" });
  await rp.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  const actionDet = await rp.evaluate(() =>
    [...document.querySelectorAll("a[href]")].map((a) => a.pathname + a.search)
      .find((h) => /\/registrar\/actions\/[1-9A-HJ-NP-Za-km-z]{20,}/.test(h)));
  console.log("ACTION DETAIL:", actionDet ?? "(none)");
  if (actionDet) {
    for (const locale of ["en", "ru"]) {
      await rc.addCookies([{ name: "NEXT_LOCALE", value: locale, url: SITE }]);
      await check(rp, actionDet, locale, 1440, 2500);
      await check(rp, "/registrar/activity", locale, 1440, 2500);
    }
  }
  await rp.close(); await rc.close();

  // Investor: signed-in cabinet + statements detail if any.
  const [ic, ip] = await signIn(browser, "investor");
  console.log("investor signed in:", ip.url());
  const invRoutes = ["/investor", "/investor/placement", "/investor/meetings", "/investor/statements", "/investor/reports", "/investor/kyc"];
  for (const locale of ["en", "ru", "kk"]) {
    await ic.addCookies([{ name: "NEXT_LOCALE", value: locale, url: SITE }]);
    for (const width of [1440, 390]) for (const r of invRoutes) await check(ip, r, locale, width);
  }
  await ip.close(); await ic.close();

  // /login RPC storm quantification: one clean load, count RPC endpoints hit.
  const lc = await browser.newContext();
  const lp = await lc.newPage();
  const rpc = { "api.devnet.solana.com": 0, "solana-devnet-rpc.publicnode.com": 0 };
  lp.on("request", (r) => {
    const u = r.url();
    for (const k of Object.keys(rpc)) if (u.includes(k) && r.method() === "POST") rpc[k]++;
  });
  await lp.goto(`${SITE}/login`, { waitUntil: "domcontentloaded" });
  await lp.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await lp.waitForTimeout(5000);
  const loginText = await lp.evaluate(() => document.body.innerText.slice(0, 600));
  await lp.screenshot({ path: `${SHOTS}/login-rpc-storm-en-1440.jpg`, type: "jpeg", quality: 60 });
  await lp.close(); await lc.close();
  console.log("LOGIN RPC POST counts (one load, ~5 s settle):", JSON.stringify(rpc));
  console.log("LOGIN text head:", loginText.slice(0, 250).replace(/\n/g, " "));

  fs.writeFileSync(OUT, JSON.stringify({ pages, rpc }, null, 1));
  console.log(`DONE2: ${pages.length} page-loads → ${OUT}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
