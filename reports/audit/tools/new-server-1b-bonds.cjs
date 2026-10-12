#!/usr/bin/env node
// Phase A2: re-run of the phase-A steps that failed during the RPC-429 window (task 91580, resumed):
// /bonds board (All), all 4 showcase dossiers, ru/kk dossier spot-check, plus re-check of the two
// phase-C suspects (registrar dashboard "unavailable" banner, /issuer/organization 404 was a script typo).
module.paths.push("/Users/dev/code/hackatons/kase/qupon-kit/apps/web/node_modules");
const { chromium } = require("@playwright/test");
const fs = require("fs");

const SITE = "https://qupon.185-216-25-91.sslip.io";
const OUT = __dirname + "/../shots/new-server";
const results = [];
const issues = [];

async function shot(page, name, quality = 70) {
  const path = `${OUT}/${name}.jpg`;
  await page.screenshot({ path, type: "jpeg", quality });
  if (fs.statSync(path).size > 300_000) await page.screenshot({ path, type: "jpeg", quality: 40 });
  return `${(fs.statSync(path).size / 1024).toFixed(0)}KB`;
}

async function load(ctx, url, waitMs = 4000) {
  const t0 = Date.now();
  const p = await ctx.newPage();
  let status = "?";
  const onResp = (r) => { if (r.url().split("?")[0] === url.split("?")[0]) status = r.status(); };
  ctx.on("response", onResp);
  try {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await p.waitForTimeout(waitMs);
  } catch (e) {
    results.push({ step: url, ok: false, ms: Date.now() - t0, evidence: `goto: ${String(e).split("\n")[0].slice(0, 110)}` });
    return { p, status: "ERR", text: "" };
  } finally { ctx.off("response", onResp); }
  const text = await p.evaluate(() => document.body.innerText);
  return { p, status, text, ms: Date.now() - t0 };
}

(async () => {
  const browser = await chromium.launch();

  // showcase series: prefer live API, fall back to the mints recorded in the interrupted run
  let series = [
    { isin: "KZ2C0QPN0018", mint: "5tww8A3MXG5VYwabQGoSy7M4wgcXWJMJqu7MhqqQpT34", status: "Active" },
    { isin: "KZ2C0QPN0026", mint: "GKRsSH9vkqAdKcVsHY8aAhUGUt5iAGPSarRTWBFrR93k", status: "Closed" },
    { isin: "KZ2C0QPN0034", mint: "E7RgTKWT5VTVKTmscWHgHwSJfjc1TqU9WVkoDjLDxegf", status: "Active" },
    { isin: "KZ2C0QPN0042", mint: "9zunUAFsWDirHhH5JiMDK6k5J16kPG65FYYgVySoDRbL", status: "Active" },
  ];
  const pctx = await browser.newContext();
  try {
    const r = await pctx.request.get("https://api.185-216-25-91.sslip.io/series", { timeout: 30_000 });
    if (r.status() === 200) {
      const j = await r.json();
      const arr = Array.isArray(j) ? j : j.series || j.items || [];
      const live = arr.filter((s) => (s.isin || "").startsWith("KZ2C0QPN")).map((s) => ({ isin: s.isin, mint: s.mint, status: s.status || (s.closed ? "Closed" : "Active") }));
      if (live.length >= 4) { series = live; console.log(`series from API: ${live.map((s) => `${s.isin}:${s.status}`).join(", ")}`); }
      else console.log(`API returned ${live.length} showcase series — using fallback list`);
    } else console.log(`API /series HTTP ${r.status()} — using fallback list`);
  } catch (e) { console.log(`API /series failed (${String(e).split("\n")[0].slice(0, 80)}) — using fallback list`); }
  await pctx.close();

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "en", url: SITE }]);
  const errs = [];
  ctx.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });

  // /bonds board, All chip
  {
    const { p, status, text, ms } = await load(ctx, SITE + "/bonds", 3500);
    const allChip = p.getByRole("button", { name: /^All$/i }).or(p.getByRole("link", { name: /^All$/i })).first();
    try { await allChip.click({ timeout: 5000 }); await p.waitForTimeout(2000); } catch {}
    const textAll = await p.evaluate(() => document.body.innerText);
    const isins = [...new Set(textAll.match(/KZ2C0QPN\d{4}/g) || [])];
    results.push({ step: "bonds board (All)", ok: status == 200 && isins.length >= 4 && /Closed/.test(textAll), ms, evidence: `HTTP ${status}; series: ${isins.join(",")}; Closed shown=${/Closed/.test(textAll)}` });
    console.log(await shot(p, "02-bonds-all-en"));
    await p.close();
  }

  // dossiers
  for (const s of series) {
    const { p, status, text, ms } = await load(ctx, `${SITE}/bonds/${s.mint}`, 4500);
    const nums = /500[.,]?00/.test(text) && /1[,.]?250[,.]?00/.test(text);
    const links = (text.match(/explorer\.solana\.com/g) || []).length;
    const closed = /Redeemed|Closed|retired|burn/i.test(text);
    results.push({ step: `dossier ${s.isin} (${s.status})`, ok: status == 200 && text.length > 1000 && nums && links > 0, ms, evidence: `HTTP ${status}; 500/1250=${nums}; explorerLinks=${links}; closedWords=${closed}; ${text.length} chars` });
    console.log(await shot(p, `03-dossier-${s.isin}`));
    await p.close();
  }

  // ru/kk on the closed dossier
  const closedS = series.find((s) => s.status === "Closed") || series[1];
  for (const loc of ["ru", "kk"]) {
    await ctx.clearCookies();
    await ctx.addCookies([{ name: "NEXT_LOCALE", value: loc, url: SITE }]);
    const { p, status, text } = await load(ctx, `${SITE}/bonds/${closedS.mint}`, 4000);
    results.push({ step: `dossier ${closedS.isin} [${loc}]`, ok: status == 200 && text.length > 1000 && /10\s?[.,]?\s?000/.test(text), ms: 0, evidence: `HTTP ${status}; redemption 10 000=${/10\s?[.,]?\s?000/.test(text)}` });
    console.log(await shot(p, `03-dossier-${closedS.isin}-${loc}`));
    await p.close();
  }
  await ctx.clearCookies();
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "en", url: SITE }]);

  // registrar dashboard re-check (banner seen during the 429 window) — via one-click registrar demo
  {
    const lp = await ctx.newPage();
    await lp.goto(`${SITE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await lp.waitForTimeout(1500);
    const btn = lp.getByRole("button", { name: /^registrar/i }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click(); await lp.waitForTimeout(4000);
      const { p, status, text, ms } = await load(ctx, `${SITE}/registrar`, 5000);
      const banner = /unavailable/i.test(text);
      results.push({ step: "registrar dashboard (recheck)", ok: status == 200 && !banner, ms, evidence: `HTTP ${status}; unavailable-banner=${banner}` });
      console.log(await shot(p, "23-registrar-dashboard-recheck"));
      await p.close();
    } else results.push({ step: "registrar dashboard (recheck)", ok: false, ms: 0, evidence: "registrar demo button not visible on /login" });
    await lp.close();
  }

  // issuer organization (US spelling — phase C used the British typo and got a 404)
  {
    const lp = await ctx.newPage();
    await lp.goto(`${SITE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await lp.waitForTimeout(1500);
    const out = lp.getByRole("button", { name: /sign out/i }).first();
    if (await out.isVisible().catch(() => false)) { await out.click(); await lp.waitForTimeout(2000); }
    const btn = lp.getByRole("button", { name: /^issuer/i }).first();
    await btn.click({ timeout: 15_000 }); await lp.waitForTimeout(4000);
    const { p, status, text, ms } = await load(ctx, `${SITE}/issuer/organization`, 4000);
    results.push({ step: "issuer organization (US spelling)", ok: status == 200, ms, evidence: `HTTP ${status}; ${text.length} chars` });
    console.log(await shot(p, "21-issuerorganization"));
    await p.close();
    await lp.close();
  }

  if (errs.length) issues.push([...new Set(errs)].slice(0, 8));
  fs.writeFileSync("/tmp/ns-results-a2.json", JSON.stringify({ results, consoleErrors: issues.length ? issues[0] : [] }, null, 2));
  await browser.close();
  console.log("\n=== RESULTS A2 ===");
  for (const r of results) console.log(`${r.ok ? "OK " : "FAIL"} | ${r.step} | ${(r.ms / 1000).toFixed(1)}s | ${r.evidence}`);
})().catch((e) => { console.error(e); process.exit(1); });
