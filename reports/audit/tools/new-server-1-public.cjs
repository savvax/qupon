#!/usr/bin/env node
// Common shim: resolve playwright from the main checkout (this worktree has no node_modules).
module.paths.push("/Users/dev/code/hackatons/kase/qupon-kit/apps/web/node_modules");
const { chromium } = require("@playwright/test");

const SITE = process.env.NS_SITE || "https://qupon.185-216-25-91.sslip.io";
const OUT = __dirname + "/../shots/new-server";
const fs = require("fs");

const results = []; // {step, ok, ms, evidence, url, status}
const issues = []; // console errors / failed requests per page

async function shot(page, name, { full = false, quality = 72 } = {}) {
  const path = `${OUT}/${name}.jpg`;
  await page.screenshot({ path, type: "jpeg", quality, fullPage: full });
  const sz = fs.statSync(path).size;
  if (sz > 300_000) {
    await page.screenshot({ path, type: "jpeg", quality: 40, fullPage: full });
  }
  return `${(fs.statSync(path).size / 1024).toFixed(0)}KB`;
}

function watch(ctx) {
  const consoleErrors = [];
  const failedReqs = [];
  ctx.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  ctx.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 200)));
  ctx.on("requestfailed", (r) => failedReqs.push(`${r.method()} ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
  return { consoleErrors, failedReqs };
}

async function loadPage(ctx, url, { waitMs = 2500, timeout = 60_000 } = {}) {
  const t0 = Date.now();
  let status = "?";
  const p = await ctx.newPage();
  const onResp = (r) => { if (r.url() === url || r.url().split("?")[0] === url.split("?")[0]) status = r.status(); };
  ctx.on("response", onResp);
  try {
    await p.goto(url, { waitUntil: "domcontentloaded", timeout });
    await p.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await p.waitForTimeout(waitMs);
  } catch (e) {
    results.push({ step: url, ok: false, ms: Date.now() - t0, evidence: `goto failed: ${String(e).split("\n")[0].slice(0, 140)}`, url, status });
    return { p, status: "ERR", text: "", ms: Date.now() - t0 };
  } finally { ctx.off("response", onResp); }
  const text = await p.evaluate(() => document.body.innerText);
  return { p, status, ms: Date.now() - t0, text };
}

(async () => {
  const browser = await chromium.launch();
  const rawI18n = /\b[a-z0-9]+(\.[a-z0-9]+){2,}\b/i; // crude raw-key detector, e.g. "nav.bonds.title"

  // ---------- locales on landing/learn ----------
  for (const locale of ["en", "ru", "kk"]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "en-US" });
    await ctx.addCookies([{ name: "NEXT_LOCALE", value: locale, url: SITE }]);
    const w = watch(ctx);
    for (const [label, path] of [["landing", "/"], ["learn", "/learn"]]) {
      const { p, status, ms, text } = await loadPage(ctx, SITE + path);
      const rawKeys = (text.match(new RegExp(rawI18n, "g")) || []).slice(0, 5);
      results.push({ step: `${label} [${locale}]`, ok: status == 200 && text.length > 500, ms, evidence: `HTTP ${status}; ${text.length} chars; hero=${/Qupon/i.test(text)}`, url: SITE + path, status });
      console.log(await shot(p, `01-${label}-${locale}`));
      if (w.consoleErrors.length || w.failedReqs.length || rawKeys.length)
        issues.push({ page: `${label}-${locale}`, consoleErrors: [...new Set(w.consoleErrors)].slice(0, 5), failedReqs: [...new Set(w.failedReqs)].slice(0, 5), rawKeys });
      await p.close();
    }
    await ctx.close();
  }

  // ---------- bonds board + dossiers (en; ru/kk spot-check on one dossier) ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: "NEXT_LOCALE", value: "en", url: SITE }]);
    const w = watch(ctx);
    const { p, status, ms } = await loadPage(ctx, SITE + "/bonds", { waitMs: 3500 });
    // click "All" chip if present
    const allChip = p.getByRole("button", { name: /^All$/i }).or(p.getByRole("link", { name: /^All$/i })).first();
    try { await allChip.click({ timeout: 4000 }); await p.waitForTimeout(2000); } catch {}
    const textAll = await p.evaluate(() => document.body.innerText);
    const isins = [...new Set(textAll.match(/KZ2C0QPN\d{4}/g) || [])];
    results.push({ step: "bonds board (All)", ok: status == 200 && isins.length >= 4, ms, evidence: `HTTP ${status}; series: ${isins.join(",")}; Closed=${/Closed/.test(textAll)}`, url: SITE + "/bonds", status });
    console.log(await shot(p, "02-bonds-all-en"));
    await p.close();

    let mints = [];
    try { mints = JSON.parse(fs.readFileSync("/tmp/ns-series.json", "utf8")).filter((s) => (s.isin || "").startsWith("KZ2C0QPN")); } catch (e) { console.log("series cache unreadable:", String(e).slice(0, 80)); }
    for (const s of mints) {
      const { p: dp, status: ds, ms: dms, text: dtext } = await loadPage(ctx, `${SITE}/bonds/${s.mint}`, { waitMs: 4500 });
      const hasNums = /500/.test(dtext) && /1,?250/.test(dtext);
      const hasLinks = (dtext.match(/explorer\.solana\.com/g) || []).length;
      results.push({ step: `dossier ${s.isin} (${s.status})`, ok: ds == 200 && dtext.length > 1000, ms: dms, evidence: `HTTP ${ds}; entitlementNums=${hasNums}; explorerLinks=${hasLinks}; burn=${/burn|Burn/i.test(dtext) || s.status !== "Closed"}`, url: `${SITE}/bonds/${s.mint}`, status: ds });
      console.log(await shot(dp, `03-dossier-${s.isin}`));
      await dp.close();
    }
    // ru/kk spot check on the closed dossier (0026)
    const closed = mints.find((s) => s.status === "Closed") || mints[0];
    for (const loc of ["ru", "kk"]) {
      await ctx.clearCookies();
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: loc, url: SITE }]);
      const { p: dp, status: ds, text: dtext } = await loadPage(ctx, `${SITE}/bonds/${closed.mint}`, { waitMs: 4000 });
      results.push({ step: `dossier ${closed.isin} [${loc}]`, ok: ds == 200 && dtext.length > 1000, ms: 0, evidence: `HTTP ${ds}; redemption table=${/10\s?000/.test(dtext)}`, url: `${SITE}/bonds/${closed.mint}`, status: ds });
      console.log(await shot(dp, `03-dossier-${closed.isin}-${loc}`));
      await dp.close();
    }
    await ctx.clearCookies();
    await ctx.addCookies([{ name: "NEXT_LOCALE", value: "en", url: SITE }]);
    if (w.consoleErrors.length || w.failedReqs.length) issues.push({ page: "bonds/dossiers", consoleErrors: [...new Set(w.consoleErrors)].slice(0, 5), failedReqs: [...new Set(w.failedReqs)].slice(0, 5), rawKeys: [] });
    await ctx.close();
  }

  // ---------- /proof + per-mint certificates (timed to "All checks pass") ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const w = watch(ctx);
    const { p, status, ms } = await loadPage(ctx, SITE + "/proof", { waitMs: 3000 });
    const links = [...new Set(await p.evaluate(() => [...document.querySelectorAll('a[href*="/proof/"]')].map((a) => a.getAttribute("href"))))];
    results.push({ step: "/proof picker", ok: status == 200 && links.length >= 2, ms, evidence: `HTTP ${status}; listed mints: ${links.join(",")}`, url: SITE + "/proof", status });
    console.log(await shot(p, "04-proof-picker"));
    await p.close();

    for (const href of links) {
      const mint = href.split("/proof/")[1];
      const t0 = Date.now();
      const pp = await ctx.newPage();
      await pp.goto(SITE + href, { waitUntil: "domcontentloaded", timeout: 60_000 });
      // poll up to 6 min for "All checks pass"
      let passAt = null, midShot = false;
      while (Date.now() - t0 < 360_000) {
        await pp.waitForTimeout(10_000);
        const t = await pp.evaluate(() => document.body.innerText);
        if (!midShot && /(Reading|reading the transaction history|of \d+\))/.test(t) && Date.now() - t0 > 20000) {
          console.log(await shot(pp, `05-proof-${mint.slice(0, 6)}-midread`, { quality: 60 }));
          midShot = true;
        }
        if (/All checks pass/i.test(t)) { passAt = ((Date.now() - t0) / 1000).toFixed(1); break; }
        if (/check(s)? (failed|failing)|✗/i.test(t) && Date.now() - t0 > 120_000) break;
      }
      const final = await pp.evaluate(() => document.body.innerText);
      const nchecks = (final.match(/✓/g) || []).length;
      const verdict = final.match(/\d+ of \d+ ✓/) ? final.match(/\d+ of \d+ ✓/)[0] : "?";
      results.push({ step: `proof certificate ${mint.slice(0, 8)}…`, ok: !!passAt, ms: Date.now() - t0, evidence: passAt ? `"All checks pass" at +${passAt}s (${verdict}, ${nchecks} ✓)` : `NOT reached in 360s; verdict=${verdict}`, url: SITE + href, status });
      console.log(await shot(pp, `05-proof-${mint.slice(0, 6)}-final`, { full: false, quality: 60 }));
      await pp.close();
    }
    if (w.consoleErrors.length || w.failedReqs.length) issues.push({ page: "proof", consoleErrors: [...new Set(w.consoleErrors)].slice(0, 5), failedReqs: [...new Set(w.failedReqs)].slice(0, 5), rawKeys: [] });
    await ctx.close();
  }

  // ---------- /holder lookup ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    // find a holder address from the closed dossier snapshot via API
    let holder = null;
    try {
      const r = await ctx.request.get("https://api.185-216-25-91.sslip.io/series/GKRsSH9vkqAdKcVsHY8aAhUGUt5iAGPSarRTWBFrR93k/holders");
      const j = await r.json();
      const hs = j.holders || j;
      holder = hs && hs[0] && (hs[0].owner || hs[0].wallet || hs[0].address);
    } catch (e) { console.log("holder fetch failed:", String(e).slice(0, 100)); }
    if (!holder) holder = "5tww8A3MXG5VYwabQGoSy7M4wgcXWJMJqu7MhqqQpT34"; // fallback: mint itself (invalid, shows error state)
    const { p, status, text, ms } = await loadPage(ctx, `${SITE}/holder/${holder}`, { waitMs: 3500 });
    results.push({ step: `holder lookup ${holder.slice(0, 8)}…`, ok: status == 200, ms, evidence: `HTTP ${status}; textLen=${text.length}; holdings=${/KZ2C0QPN|bond/i.test(text)}`, url: `${SITE}/holder/${holder}`, status });
    console.log(await shot(p, `06-holder`));
    await p.close();
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync("/tmp/ns-results-a.json", JSON.stringify({ results, issues }, null, 2));
  console.log("\n=== RESULTS A ===");
  for (const r of results) console.log(`${r.ok ? "✓" : "✗"} | ${r.step} | ${r.status} | ${(r.ms / 1000).toFixed(1)}s | ${r.evidence}`);
  console.log("=== ISSUES ===");
  console.log(JSON.stringify(issues, null, 2).slice(0, 3000));
})().catch((e) => { console.error(e); process.exit(1); });
