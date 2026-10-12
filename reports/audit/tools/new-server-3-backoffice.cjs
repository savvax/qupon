#!/usr/bin/env node
// Phase C: back-office walkthrough via one-click demo sign-in (task 91580).
// Read-only except one investor vote on a non-showcase series (only if a meeting is open there).
module.paths.push("/Users/dev/code/hackatons/kase/qupon-kit/apps/web/node_modules");
const { chromium } = require("@playwright/test");
const fs = require("fs");

const SITE = "https://qupon.185-216-25-91.sslip.io";
const OUT = __dirname + "/../shots/new-server";
const results = [];
const notes = [];
const log = (m) => { console.log(m); notes.push(m); };

async function shot(page, name, quality = 70) {
  const path = `${OUT}/${name}.jpg`;
  await page.screenshot({ path, type: "jpeg", quality });
  if (fs.statSync(path).size > 300_000) await page.screenshot({ path, type: "jpeg", quality: 40 });
  return `${(fs.statSync(path).size / 1024).toFixed(0)}KB`;
}

async function signIn(ctx, role) {
  const p = await ctx.newPage();
  await p.goto(`${SITE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await p.waitForTimeout(1500);
  let roleBtn = p.getByRole("button", { name: new RegExp(`^${role}`, "i") }).first();
  if (!(await roleBtn.isVisible().catch(() => false))) {
    // a previous demo session is still active — sign out, then come back
    const out = p.getByRole("button", { name: /sign out/i }).first();
    if (await out.isVisible().catch(() => false)) {
      await out.click();
      await p.waitForTimeout(2500);
      await p.goto(`${SITE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await p.waitForTimeout(1500);
      roleBtn = p.getByRole("button", { name: new RegExp(`^${role}`, "i") }).first();
    }
  }
  await roleBtn.click({ timeout: 15_000 });
  await p.waitForTimeout(4000);
  const url = p.url();
  log(`sign-in [${role}] → ${url}`);
  await shot(p, `20-login-${role.toLowerCase()}`);
  return p;
}

async function walk(ctx, p, label, path, { waitMs = 3500, shotName } = {}) {
  const t0 = Date.now();
  let status = "?";
  const onResp = (r) => { if (r.url().split("?")[0] === `${SITE}${path}`) status = r.status(); };
  ctx.on("response", onResp);
  try {
    await p.goto(`${SITE}${path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await p.waitForTimeout(waitMs);
  } catch (e) {
    results.push({ step: label, ok: false, ms: Date.now() - t0, evidence: `goto: ${String(e).split("\n")[0].slice(0, 100)}` });
    return;
  } finally { ctx.off("response", onResp); }
  const text = await p.evaluate(() => document.body.innerText);
  const unavail = /registrar service is unavailable|unavailable/i.test(text);
  const rawKeys = (text.match(/\b[a-z0-9]+(\.[a-z0-9]+){2,}\b/g) || []).filter((k) => !/\d{2}\.\d{2}\.\d{4}/.test(k)).slice(0, 4);
  results.push({
    step: label, ok: status == 200 && !unavail, ms: Date.now() - t0,
    evidence: `HTTP ${status}${unavail ? "; unavailable-banner" : ""}; ${text.length} chars; rawKeys=${rawKeys.join(",") || "none"}`,
  });
  if (shotName) console.log(await shot(p, shotName));
  return text;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  ctx.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
  ctx.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));

  // ---------- ISSUER ----------
  let p = await signIn(ctx, "Issuer");
  await walk(ctx, p, "issuer dashboard", "/issuer", { shotName: "21-issuer-dashboard" });
  await walk(ctx, p, "issuer series list", "/issuer/series", { shotName: "21-issuer-series" });
  // New-series wizard up to review (do NOT submit)
  await p.goto(`${SITE}/issuer/series/new`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await p.waitForTimeout(3500);
  console.log(await shot(p, "22-wizard-terms"));
  for (const stepName of ["Next", "Continue", "Import", "Review"]) {
    const btn = p.getByRole("button", { name: new RegExp(`^${stepName}`, "i") }).first();
    if (await btn.isVisible().catch(() => false)) {
      try { await btn.click({ timeout: 4000 }); await p.waitForTimeout(2500); log(`wizard step "${stepName}" clicked`); } catch (e) { log(`wizard "${stepName}" click: ${String(e).split("\n")[0].slice(0, 80)}`); }
    }
  }
  const wizText = await p.evaluate(() => document.body.innerText);
  results.push({ step: "issuer wizard → review (no submit)", ok: /review|Review/.test(wizText), ms: 0, evidence: `reached=${/review/i.test(wizText)}; url=${p.url()}` });
  console.log(await shot(p, "22-wizard-review"));
  await walk(ctx, p, "issuer organisation", "/issuer/organisation", {});
  await p.close();

  // ---------- REGISTRAR ----------
  p = await signIn(ctx, "Registrar");
  await walk(ctx, p, "registrar dashboard", "/registrar", { shotName: "23-registrar-dashboard" });
  await walk(ctx, p, "registrar actions console", "/registrar/actions", { shotName: "23-registrar-actions" });
  await walk(ctx, p, "registrar KYC queue", "/registrar/kyc", { shotName: "23-registrar-kyc" });
  await walk(ctx, p, "registrar trades", "/registrar/trades", { shotName: "23-registrar-trades" });
  const repText = await walk(ctx, p, "registrar reports", "/registrar/reports", { shotName: "23-registrar-reports" });
  // print/report view if linked
  if (repText && /print|Print/.test(repText)) {
    try {
      await p.getByRole("button", { name: /print/i }).first().click({ timeout: 4000 });
      await p.waitForTimeout(2500);
      console.log(await shot(p, "23-registrar-print"));
      results.push({ step: "registrar reports print", ok: true, ms: 0, evidence: `print dialog/view reached; url=${p.url()}` });
    } catch (e) { results.push({ step: "registrar reports print", ok: false, ms: 0, evidence: String(e).split("\n")[0].slice(0, 100) }); }
  }
  await p.close();

  // ---------- INVESTOR ----------
  p = await signIn(ctx, "Investor");
  await walk(ctx, p, "investor portfolio", "/investor", { shotName: "24-investor-portfolio" });
  const meetText = await walk(ctx, p, "investor meetings", "/investor/meetings", { shotName: "24-investor-meetings" });
  // vote ONLY on a non-showcase series (sandbox/E2E ISINs, not KZ2C0QPN showcase)
  if (meetText && /(vote|Vote|For|Against)/.test(meetText)) {
    const showcase = /KZ2C0QPN00(18|26|34|42)/;
    const bodyText = meetText;
    if (showcase.test(bodyText)) {
      log(`meetings page lists a showcase series — NOT voting (rule)`);
      results.push({ step: "investor vote", ok: false, ms: 0, evidence: "skipped: meeting visible is on a showcase series" });
    } else {
      const forBtn = p.getByRole("button", { name: /^(For|За)$/i }).first();
      if (await forBtn.isVisible().catch(() => false)) {
        try {
          await forBtn.click({ timeout: 5000 });
          await p.waitForTimeout(6000);
          const after = await p.evaluate(() => document.body.innerText);
          results.push({ step: "investor vote (non-showcase)", ok: /voted|Your vote|recorded/i.test(after), ms: 0, evidence: `vote submitted; url=${p.url()}` });
          console.log(await shot(p, "24-investor-voted"));
        } catch (e) { results.push({ step: "investor vote", ok: false, ms: 0, evidence: String(e).split("\n")[0].slice(0, 100) }); }
      } else results.push({ step: "investor vote", ok: true, ms: 0, evidence: "no open meeting to vote on" });
    }
  } else {
    results.push({ step: "investor vote", ok: true, ms: 0, evidence: "meetings page has no vote UI (no open meeting)" });
  }
  await p.close();

  // ---------- ADMIN ----------
  const lp = await ctx.newPage();
  await lp.goto(`${SITE}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await lp.waitForTimeout(1500);
  const adminBtn = lp.getByRole("button", { name: /^admin$/i }).first();
  const hasAdmin = await adminBtn.isVisible().catch(() => false);
  log(`admin one-click button on /login: ${hasAdmin}`);
  if (hasAdmin) {
    await adminBtn.click(); await lp.waitForTimeout(4000);
    await walk(ctx, lp, "admin users", "/admin/users", { shotName: "25-admin-users" });
    await walk(ctx, lp, "admin series settings", "/admin/series", { shotName: "25-admin-series" });
    await walk(ctx, lp, "admin system", "/admin/system", { shotName: "25-admin-system" });
    const sysText = await lp.evaluate(() => document.body.innerText).catch(() => "");
    if (/rpc|RPC/.test(sysText)) log(`admin/system RPC section: ${sysText.slice(sysText.search(/RPC|rpc/), sysText.search(/RPC|rpc/) + 300).replace(/\n/g, " | ")}`);
  } else {
    // admin route directly
    await lp.goto(`${SITE}/admin`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await lp.waitForTimeout(3000);
    const t = await lp.evaluate(() => document.body.innerText);
    results.push({ step: "admin (no demo button)", ok: true, ms: 0, evidence: `/admin as demo investor → ${lp.url()}; text=${t.slice(0, 120).replace(/\n/g, " | ")}` });
    console.log(await shot(lp, "25-admin-gated"));
  }
  await lp.close();

  log(`console errors during phase C: ${[...new Set(errs)].length ? JSON.stringify([...new Set(errs)].slice(0, 6)) : "none"}`);
  fs.writeFileSync("/tmp/ns-results-c.json", JSON.stringify({ results, notes }, null, 2));
  console.log("\n=== RESULTS C ===");
  for (const r of results) console.log(`${r.ok ? "OK " : "FAIL"} | ${r.step} | ${(r.ms / 1000).toFixed(1)}s | ${r.evidence}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
