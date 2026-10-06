import { mkdirSync, writeFileSync } from "node:fs";
import { type Page, test } from "@playwright/test";

/**
 * UX audit (task 1106, not part of the regular suite: run with `--grep @audit`). Visits every page in EN/RU at
 * desktop and phone width, takes a screenshot and measures what a reviewer would flag by eye.
 * Run: AUDIT=1 AUDIT_OUT=/tmp/qupon-ux-audit pnpm e2e --grep @audit (screenshots + JSON per group).
 */
test.use({ reducedMotion: "reduce" });

const OUT = process.env.AUDIT_OUT ?? "/tmp/qupon-ux-audit";
const MINT = "QpNb1Dem0BondMint1111111111111111111111111111";
const INTR = "ActnINTR0001Dem0PDA111111111111111111111111111";
const BMET = "ActnBMET0002Dem0PDA1111111111111111111111111111";

const GROUPS: { who?: string; routes: string[] }[] = [
  {
    routes: [
      "/",
      "/bonds",
      `/bonds/${MINT}`,
      "/login",
      "/signup",
      "/does-not-exist",
    ],
  },
  {
    who: "issuer",
    routes: [
      "/issuer",
      "/issuer/series",
      "/issuer/series/new",
      `/issuer/series/${MINT}`,
      "/account",
    ],
  },
  {
    who: "registrar",
    routes: [
      "/registrar",
      "/registrar/actions",
      `/registrar/actions/${INTR}`,
      `/registrar/actions/${BMET}`,
      "/registrar/investors",
      "/registrar/activity",
      "/registrar/autopilot",
      "/registrar/kyc",
    ],
  },
  {
    who: "investor",
    routes: [
      "/investor",
      "/investor/placement",
      "/investor/meetings",
      "/investor/statements",
    ],
  },
  { who: "member", routes: ["/investor", "/account", "/investor/kyc"] },
  {
    who: "admin",
    routes: [
      "/admin",
      "/admin/users",
      "/admin/organizations",
      "/admin/assets",
      "/admin/series",
      "/admin/system",
      "/admin/network",
      "/admin/audit",
    ],
  },
];

// Wrapped-button detection was noisy with stable labels (inline-grid line boxes); review screenshots instead.
const EN_UI =
  /\b(Connect|Cancel|Save|Loading|Search|Submit|Close|Back|Next|Delete|Edit|Settings|Sign in|Sign out|Download|Upload|Status|Details|Actions?)\b/;

async function measure(page: Page, locale: string, phone: boolean) {
  return page.evaluate(
    ({ locale, phone, enUi }) => {
      const re = new RegExp(enUi);
      const vis = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return (
          r.width > 0 &&
          r.height > 0 &&
          s.visibility !== "hidden" &&
          s.display !== "none"
        );
      };
      const text = (el: Element) =>
        (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
      const out = {
        hScroll: document.documentElement.scrollWidth > innerWidth + 1,
        h1: document.querySelectorAll("h1").length,
        wrappedButtons: [] as string[],
        truncated: [] as string[],
        smallTargets: [] as string[],
        rawKeys: [] as string[],
        englishOnRu: [] as string[],
        imgNoAlt: 0,
      };
      for (const b of document.querySelectorAll(
        "button, a[class*='rounded-btn'], [role='button']",
      )) {
        if (!vis(b)) continue;
        const s = getComputedStyle(b);
        const lh =
          Number.parseFloat(s.lineHeight) ||
          Number.parseFloat(s.fontSize) * 1.4;
        const r = b.getBoundingClientRect();
        const inner =
          r.height -
          Number.parseFloat(s.paddingTop) -
          Number.parseFloat(s.paddingBottom);
        if (inner > lh * 1.6 && text(b).length > 0)
          out.wrappedButtons.push(text(b));
        if (phone && (r.width < 32 || r.height < 32) && text(b) !== "")
          out.smallTargets.push(
            `${text(b) || b.getAttribute("aria-label")} ${Math.round(r.width)}×${Math.round(r.height)}`,
          );
      }
      for (const el of document.querySelectorAll("body *")) {
        if (!vis(el) || el.children.length > 0) continue;
        const s = getComputedStyle(el);
        if (
          s.textOverflow === "ellipsis" &&
          el.scrollWidth > el.clientWidth + 1
        )
          out.truncated.push(text(el));
        const t = text(el);
        if (/^[a-z][a-zA-Z]+(\.[a-zA-Z0-9_-]+){1,4}$/.test(t))
          out.rawKeys.push(t);
        if (
          locale === "ru" &&
          re.test(t) &&
          !/Solana|Phantom|Solflare|Backpack|KASE|ISO|USDC|tKZT|KZTE|Devnet|Mainnet|Explorer|SAS|DvP/.test(
            t,
          )
        )
          out.englishOnRu.push(t);
      }
      out.imgNoAlt = [...document.querySelectorAll("img")].filter(
        (i) => !i.hasAttribute("alt"),
      ).length;
      for (const k of [
        "wrappedButtons",
        "truncated",
        "smallTargets",
        "rawKeys",
        "englishOnRu",
      ] as const)
        out[k] = [...new Set(out[k])].slice(0, 12);
      return out;
    },
    { locale, phone, enUi: EN_UI.source },
  );
}

for (const g of GROUPS)
  for (const locale of ["en", "ru"])
    for (const width of [1440, 390])
      test(`@audit ${g.who ?? "public"} ${locale} ${width}`, async ({
        page,
        baseURL,
      }) => {
        test.setTimeout(180_000);
        mkdirSync(OUT, { recursive: true });
        const url = baseURL ?? "http://localhost:3000";
        const cookies = [{ name: "NEXT_LOCALE", value: locale, url }];
        if (g.who)
          cookies.push({ name: "qupon_session", value: `mock:${g.who}`, url });
        await page.context().addCookies(cookies);
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 900,
        });
        const rows: unknown[] = [];
        for (const route of g.routes) {
          const errors: string[] = [];
          const onErr = (m: { type(): string; text(): string }) => {
            if (
              m.type() === "error" &&
              !m.text().includes("Failed to load resource")
            )
              errors.push(m.text().slice(0, 160));
          };
          page.on("console", onErr);
          const res = await page
            .goto(route, { waitUntil: "networkidle" })
            .catch(() => null);
          await page.waitForTimeout(400);
          const slug = `${g.who ?? "public"}-${route.replace(/[^a-z0-9]+/gi, "-").slice(0, 40) || "home"}-${locale}-${width}`;
          await page
            .screenshot({ path: `${OUT}/${slug}.png`, fullPage: true })
            .catch(() => undefined);
          const m = await measure(page, locale, width === 390);
          page.off("console", onErr);
          rows.push({
            who: g.who ?? "public",
            route,
            locale,
            width,
            status: res?.status(),
            errors,
            ...m,
            shot: `${slug}.png`,
          });
        }
        writeFileSync(
          `${OUT}/${g.who ?? "public"}-${locale}-${width}.json`,
          JSON.stringify(rows, null, 2),
        );
      });
