#!/usr/bin/env node
// Live sweep of the NEW primary server (task 91582), method of task 91567 (reports/audit/live-sweep.md):
// every public route + every demo-reachable cabinet route × en/ru/kk × 1440/390. GET-only except the
// sanctioned one-click demo sign-in. NO sandbox creation (task 91580 owns that) — /sandbox/* skipped.
// Timeouts retry 3× (this Mac's VPN drops ~7 % of connections; server-side probes showed 0 failures).
// Machine report: /tmp/new-server-sweep.json; findings → reports/audit/new-server-sweep.md. Run:
//   NODE_PATH=/Users/dev/code/hackatons/kase/qupon-kit/apps/web/node_modules node reports/audit/tools/new-server-sweep.cjs
const { chromium } = require("@playwright/test");
const fs = require("node:fs");

const SITE = process.env.SWEEP_SITE ?? "https://qupon.185-216-25-91.sslip.io";
const SHOTS = "reports/audit/shots/new-server-sweep";
const OUT = "/tmp/new-server-sweep.json";

const pages = [];
const extLinks = new Map(); // url -> { status, where[] }
const explorerLinks = []; // { url, where, devnet: bool }
const proofTiming = []; // { mint, seconds, allPass: bool }

const I18N_KEY = /\b[a-z]{2,12}\.[a-z]{2,12}\.[a-z]{2,12}\b/g;
const SNAKE = /\b[a-z]+_[a-z_]+\b/g;
const BAD = /\b(NaN|undefined|Invalid Date)\b/g;
const EN_WORDS =
  /\b(the|and|with|for|from|your|this|that|will|been|not|are|was|you|our|they|their|have|has|does|loading|error|failed|download|available|pending|approved|rejected)\b/g;

const pathOf = (u) => {
  try {
    return new URL(u).pathname;
  } catch {
    return null;
  }
};

function noteExt(url, where) {
  if (!url.startsWith("http") || url.startsWith(SITE)) return;
  if (/explorer\.solana\.com/.test(url)) {
    explorerLinks.push({ url, where, devnet: /[?&]cluster=devnet/.test(url) });
    return;
  }
  const e = extLinks.get(url) ?? { status: null, where: [] };
  if (!e.where.includes(where)) e.where.push(where);
  extLinks.set(url, e);
}

async function gotoRetry(page, route) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      return await page.goto(SITE + route, { waitUntil: "domcontentloaded", timeout: 45_000 });
    } catch (e) {
      lastErr = e;
      await page.waitForTimeout(3000);
    }
  }
  throw lastErr;
}

async function check(page, route, locale, width, opts = {}) {
  const entry = { route, locale, width, status: null, errors: [], failed: [], overflow: 0,
    brokenImgs: [], i18nKeys: [], snake: [], bad: [], enHits: 0, digest: "", links: [], retries: 0 };
  const onConsole = (m) => {
    const t = m.text();
    if (m.type() === "error" && !t.includes("Failed to load resource")) entry.errors.push(t.slice(0, 300));
  };
  const onPageErr = (e) => entry.errors.push(`pageerror: ${String(e).slice(0, 300)}`);
  page.on("console", onConsole);
  page.on("pageerror", onPageErr);
  page.on("response", (r) => {
    if (r.status() >= 400)
      entry.failed.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`);
    if (r.request().isNavigationRequest()) entry.status = r.status();
  });
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  try {
    for (let i = 0; i < 3; i++) {
      try {
        await page.goto(SITE + route, { waitUntil: "domcontentloaded", timeout: 45_000 });
        break;
      } catch (e) {
        entry.retries++;
        if (i === 2) entry.errors.push(`goto: ${String(e).slice(0, 300)}`);
        else await page.waitForTimeout(3000);
      }
    }
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    if (opts.settle) await page.waitForTimeout(opts.settle);
  } catch (e) {
    entry.errors.push(`goto: ${String(e).slice(0, 300)}`);
  }
  try {
    const data = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        text: text.slice(0, 2500),
        links: [...document.querySelectorAll("a[href]")].map((a) => a.href),
        imgs: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
        title: document.title,
        h1: document.querySelector("h1")?.innerText ?? "",
      };
    });
    entry.overflow = data.overflow;
    entry.brokenImgs = data.imgs;
    entry.digest = `${data.title} | ${data.h1} | ${data.text.slice(0, 400).replace(/\n/g, " ")}`;
    const low = ` ${data.text} `;
    entry.i18nKeys = [...new Set(low.match(I18N_KEY) ?? [])].slice(0, 10);
    entry.snake = [...new Set(low.match(SNAKE) ?? [])].slice(0, 10);
    entry.bad = [...new Set(low.match(BAD) ?? [])];
    if (locale !== "en") entry.enHits = (low.match(EN_WORDS) ?? []).length;
    for (const href of data.links) noteExt(href, `${locale} ${route}`);
    entry.links = data.links;
  } catch (e) {
    entry.errors.push(`evaluate: ${String(e).slice(0, 200)}`);
  }
  const defective =
    entry.errors.length || entry.failed.length || entry.overflow > 0 ||
    entry.brokenImgs.length || entry.i18nKeys.length || entry.bad.length;
  if (defective) {
    const file = `${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home"}-${locale}-${width}.jpg`;
    try {
      await page.screenshot({ path: `${SHOTS}/${file}`, type: "jpeg", quality: 60 });
      entry.shot = file;
    } catch {}
  }
  page.off("console", onConsole);
  page.off("pageerror", onPageErr);
  pages.push(entry);
  console.log(`${entry.status} ${locale} ${width} ${route}${defective ? " ⚠" : ""} ${
    entry.failed[0] ?? ""} ${entry.i18nKeys[0] ?? ""} ${entry.bad[0] ?? ""} ${
    entry.overflow > 0 ? `overflow+${entry.overflow}` : ""}${entry.retries ? ` retry×${entry.retries}` : ""}`);
  return entry;
}

async function setLocale(context, locale) {
  await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: SITE }]);
}

async function sweep(page, context, routes, opts = {}) {
  for (const locale of ["en", "ru", "kk"]) {
    await setLocale(context, locale);
    for (const width of [1440, 390])
      for (const r of routes) await check(page, r, locale, width, opts);
  }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();

  // ---- Phase 1: discovery (en, desktop, no session). No sandbox creation. ----
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const home = await check(page, "/", "en", 1440, { settle: 2500 });
  const bonds = await check(page, "/bonds", "en", 1440, { settle: 2500 });
  const mintRoutes = [...new Set((bonds.links ?? [])
    .map(pathOf).filter((p) => p && /\/bonds\/[1-9A-HJ-NP-Za-km-z]{32,}/.test(p)))];
  console.log("SHOWCASE DOSSIERS:", mintRoutes.join(" "));
  const proofIdx = await check(page, "/proof", "en", 1440, { settle: 2500 });
  const proofRoutes = [...new Set((proofIdx.links ?? [])
    .map(pathOf).filter((p) => p && /\/proof\/[1-9A-HJ-NP-Za-km-z]{32,}/.test(p)))];
  console.log("PROOF MINTS:", proofRoutes.join(" "));

  // /proof timing: time from navigation start to "All checks pass" (A91567-2 comparison).
  for (const pr of proofRoutes) {
    const mint = pr.split("/").pop();
    const t0 = Date.now();
    let allPass = false;
    try {
      await gotoRetry(page, pr);
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        allPass = await page.evaluate(() =>
          /All checks pass/i.test(document.body.innerText)).catch(() => false);
        if (allPass) break;
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      console.log(`proof timing failed for ${mint}: ${e}`);
    }
    proofTiming.push({ mint, seconds: Math.round((Date.now() - t0) / 100) / 10, allPass });
    console.log(`PROOF TIME ${mint}: ${proofTiming.at(-1).seconds}s allPass=${allPass}`);
  }

  await check(page, "/login", "en", 1440, { settle: 1500 });
  const roles = await page.evaluate(() =>
    [...document.querySelectorAll('button[name="role"]')].map((b) => b.value));
  console.log("DEMO ROLES:", roles.join(","));

  const holderRoutes = new Set();
  for (const e of [home, bonds, proofIdx])
    for (const l of e.links ?? []) {
      const p = pathOf(l);
      if (p && p.startsWith("/holder/")) holderRoutes.add(p);
    }
  const holderRoute = [...holderRoutes][0];
  console.log("HOLDER ROUTE:", holderRoute ?? "(none linked)");

  for (const r of ["/console", "/portal", "/does-not-exist", "/holder", "/invite", "/forbidden", "/signup", "/learn"])
    await check(page, r, "en", 1440, { settle: 1500 });

  // ---- Phase 2: public matrix (sandbox routes excluded: task 91580 owns sandbox) ----
  const publicRoutes = ["/", "/bonds", ...mintRoutes, "/learn", "/proof", ...proofRoutes,
    "/login", "/signup", "/invite", "/invite/demo-invite-token", "/reset/demo-reset-token",
    "/does-not-exist", ...(holderRoute ? [holderRoute] : [])];
  await sweep(page, ctx, publicRoutes, { settle: 1500 });

  // ---- Phase 3: cabinets via the one-click demo sign-in ----
  for (const role of roles) {
    const c = await browser.newContext();
    const p = await c.newPage();
    await p.goto(`${SITE}/login`, { waitUntil: "domcontentloaded" });
    await p.getByRole("button", { name: new RegExp(role, "i") }).click().catch((e) =>
      console.log(`sign-in ${role} failed: ${e}`));
    await p.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await p.waitForTimeout(2000);
    // Coach-mark tours would cover the pages being reviewed — mark them done.
    await p.addInitScript(() => {
      for (const r of ["registrar", "issuer", "investor", "sandbox"])
        localStorage.setItem(`qupon.tour.${r}`, "done");
    });
    console.log(`SIGNED IN ${role}:`, pathOf(p.url()));
    const nav = await p.evaluate(() =>
      [...new Set([...document.querySelectorAll('a[href^="/"]')].map((a) => a.pathname))]).catch(() => []);
    const fixed = {
      issuer: ["/issuer", "/issuer/series", "/issuer/series/new", "/issuer/documents", "/issuer/organization", "/issuer/team"],
      registrar: ["/registrar", "/registrar/actions", "/registrar/investors", "/registrar/activity", "/registrar/autopilot", "/registrar/kyc", "/registrar/reports", "/registrar/trades"],
      investor: ["/investor", "/investor/placement", "/investor/meetings", "/investor/statements", "/investor/reports", "/investor/kyc"],
      admin: ["/admin", "/admin/series", "/admin/users", "/admin/organizations", "/admin/assets", "/admin/audit", "/admin/network", "/admin/system"],
    }[role] ?? [];
    const routes = [...new Set([...fixed, ...nav.filter((n) => n.startsWith(`/${role}`))])];
    for (const list of ["/registrar/actions", "/registrar/kyc", "/issuer/series", "/investor/statements"]) {
      if (!routes.includes(list)) continue;
      await p.goto(SITE + list, { waitUntil: "domcontentloaded" }).catch(() => {});
      await p.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      const det = await p.evaluate((listUrl) => {
        const want = listUrl.includes("kyc") ? /\/registrar\/kyc\/\d+/
          : listUrl.includes("actions") ? /\/registrar\/actions\/[1-9A-HJ-NP-Za-km-z]{20,}/
          : listUrl.includes("issuer") ? /\/issuer\/series\/[1-9A-HJ-NP-Za-km-z]{20,}/
          : /\/investor\/statements\/\S+/;
        return [...document.querySelectorAll("a[href]")]
          .map((a) => a.pathname + a.search)
          .find((h) => want.test(h));
      }, list).catch(() => undefined);
      if (det) { console.log(`detail for ${list}: ${det}`); routes.push(det); }
    }
    await sweep(p, c, routes, { settle: 1500 });
    await p.close();
    await c.close();
  }

  // ---- Phase 4: external link HEAD checks (retry 3× per task rules) ----
  for (const [url, e] of extLinks) {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await ctx.request.head(url, { timeout: 15_000, maxRedirects: 5 });
        e.status = r.status();
        break;
      } catch (err) {
        try {
          const r = await ctx.request.get(url, { timeout: 15_000, maxRedirects: 5 });
          e.status = r.status();
          break;
        } catch (err2) {
          e.status = `ERR ${String(err2).slice(0, 80)}`;
          await new Promise((res) => setTimeout(res, 2000));
        }
      }
    }
  }

  fs.writeFileSync(OUT, JSON.stringify({ pages, extLinks: [...extLinks], explorerLinks, proofTiming }, null, 1));
  const bad = pages.filter((p) =>
    p.errors.length || p.failed.length || p.overflow > 0 || p.brokenImgs.length || p.i18nKeys.length || p.bad.length);
  const noDevnet = explorerLinks.filter((l) => !l.devnet);
  console.log(`\nDONE: ${pages.length} page-loads, ${bad.length} defective, ${extLinks.size} external links, ` +
    `${explorerLinks.length} explorer links (${noDevnet.length} without cluster=devnet). Report: ${OUT}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
