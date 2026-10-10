import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { rpcKey } from "../src/lib/proof/rpcKey";
import { signInAs } from "./session";

// Screenshots must be byte-stable: emulated reduced motion turns every ambient animation
// (hero grid drift / card float, badge pops) and JS entrances into their final state (§5.6).
test.use({ reducedMotion: "reduce" });

// Every page × EN/RU/KK × desktop/phone: no console errors (next-intl reports missing messages there), no
// horizontal scroll, and a screenshot for review (default reports/ui/sweep/, or SWEEP_OUT=<repo-relative dir>
// for the design pre-flight, task 1537 — which also gets an index.md of every shot).
const MINT = "QpNb1Dem0BondMint1111111111111111111111111111";
const INTR = "ActnINTR0001Dem0PDA111111111111111111111111111";
const BMET = "ActnBMET0002Dem0PDA1111111111111111111111111111";
// Design pre-flight console fixtures (task 91551 re-shots): the Announced coupon, the D4 default and the D6
// bank-routed redemption (mocks/api.ts) — SWEEP_ROUTES can only select routes a group already lists.
const INTR3 = "ActnINTR0003Dem0PDA111111111111111111111111111";
const DFLT = "ActnINTR0006Dem0PDA111111111111111111111111111";
const REDM = "ActnREDM0007Dem0PDA111111111111111111111111111";
// Showcase series (task 1535, mirrors internal/api/showcase.go) and the plan-15 bond whose devnet responses
// are recorded in e2e/fixtures/proof-rpc.json — /proof/<other mint> has nothing to verify against.
const SHOWCASE = "PwrAlmtDem0Mint11111111111111111111111111111";
const PLAN15 = "7MBQ7yA7CBgktQZ5k9GCwHPcWtMANUhJgQHCRrXzC35F";
// INVESTOR_OWNERS[0] in src/mocks/api.ts: positions in both series, the bank payout route, paid coupons.
const HOLDER = "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo";

const GROUPS: {
  role?: "issuer" | "registrar" | "investor" | "admin";
  routes: string[];
}[] = [
  {
    routes: [
      "/",
      "/bonds",
      `/bonds/${MINT}`,
      `/bonds/${SHOWCASE}`,
      `/holder/${HOLDER}`,
      "/login",
      "/signup",
      "/invite/demo-invite-token",
      "/reset/demo-reset-token",
      "/ui",
      "/does-not-exist",
    ],
  },
  {
    // Plan-15 public pages: the learn hub, the verifier, the judge sandbox's frozen states (fx-<state>,
    // src/mocks/features/sandbox.ts). /sandbox/new redirects to a fresh sandbox (same one per browser session).
    routes: [
      "/learn",
      "/proof",
      `/proof/${PLAN15}`,
      "/sandbox/new",
      "/sandbox/fx-snapshot",
      "/sandbox/fx-paying",
      "/sandbox/fx-defaulted",
      "/sandbox/fx-bank",
    ],
  },
  {
    role: "issuer",
    routes: [
      "/issuer",
      "/issuer/series",
      "/issuer/series/new",
      `/issuer/series/${MINT}`,
      "/issuer/documents",
      "/issuer/organization",
      "/issuer/team",
    ],
  },
  {
    role: "registrar",
    routes: [
      "/registrar",
      "/registrar/actions",
      `/registrar/actions/${INTR}`,
      `/registrar/actions/${INTR3}`,
      `/registrar/actions/${DFLT}`,
      `/registrar/actions/${REDM}`,
      `/registrar/actions/${BMET}`,
      "/registrar/investors",
      "/registrar/activity",
      "/registrar/autopilot",
      "/registrar/kyc",
      "/registrar/kyc/4",
      "/registrar/reports",
      `/print/holders?mint=${MINT}`,
      `/print/payouts?pda=${INTR}`,
    ],
  },
  {
    role: "investor",
    routes: [
      "/investor",
      "/investor/placement",
      "/investor/meetings",
      "/investor/statements",
      "/investor/reports",
      "/investor/kyc",
    ],
  },
  {
    role: "admin",
    routes: [
      "/admin",
      "/admin/series",
      "/admin/users",
      "/admin/organizations",
      "/admin/assets",
      "/admin/audit",
      "/admin/network",
      "/admin/system",
    ],
  },
];

// /ui is the dev-only primitive gallery — intentionally English (design pre-flight #30): shoot en only.
const EN_ONLY = (route: string) => route === "/ui";

const slug = (route: string) =>
  route
    .replace(/^\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "home";

// SWEEP_ROUTES="comma,separated,paths": shoot only those routes (path before "?"), e.g. to re-shoot
// a slice after a design fix (task 91546). Groups whose routes all filter out are skipped entirely.
const SWEEP_ROUTES = (process.env.SWEEP_ROUTES ?? "")
  .split(",")
  .map((r) => r.trim().split("?")[0]!)
  .filter(Boolean);
const inScope = (route: string) =>
  SWEEP_ROUTES.length === 0 || SWEEP_ROUTES.includes(route.split("?")[0]!);

// Shot directory: SWEEP_OUT (repo-root relative) or the default reports/ui/sweep (also repo-root relative).
// Leading "../" segments (e.g. "../../reports/…", typed relative to apps/web) are stripped so a run from a
// worktree never strays into a sibling checkout — round 2 re-shot the main repo's dir instead of ours.
const OUT = path.resolve(
  __dirname,
  "../../../",
  (process.env.SWEEP_OUT ?? "reports/ui/sweep").replace(/^(?:\.\.\/)+/, ""),
);
const SHOTS = new Map<string, string>(); // file name → route, for the index

const RECORDED = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures/proof-rpc.json"), "utf8"),
) as Record<string, unknown>;

/** /proof/<mint> reads devnet from the browser: answer from the recorded responses (e2e/proof.spec.ts). */
async function mockRpc(page: Page) {
  await page.route(
    (url) => url.host === "api.devnet.solana.com",
    async (route) => {
      const req = JSON.parse(route.request().postData() ?? "{}") as {
        id: string;
        method: string;
        params?: unknown;
      };
      const k = rpcKey(req.method, req.params);
      await route.fulfill({
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(
          k in RECORDED
            ? { jsonrpc: "2.0", id: req.id, result: RECORDED[k] }
            : {
                jsonrpc: "2.0",
                id: req.id,
                error: { code: -32601, message: `not recorded: ${req.method}` },
              },
        ),
      });
    },
  );
}

async function check(page: Page, route: string, locale: string, width: number) {
  const errors: string[] = [];
  // Next 15 dev only: its segment-explorer node (SegmentTrieNode) sometimes shifts every useId under the page,
  // so React reports a mismatch whose diff is nothing but GlossaryTerm ids; any other difference still fails.
  const idOnly = (text: string) =>
    text.includes("hydration-mismatch") &&
    text
      .split("\n")
      .filter((l) => /^[+-]\s{2,}\S/.test(l))
      .every((l) => l.includes("qp-g"));
  const onConsole = (m: { type(): string; text(): string }) => {
    const text = m.text();
    if (
      m.type() === "error" &&
      !text.includes("Failed to load resource") &&
      !idOnly(text)
    )
      errors.push(text);
  };
  page.on("console", onConsole);
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.goto(route);
  await page.waitForLoadState("networkidle");
  // The verifier page settles when the verdict renders (mocked RPC answers instantly).
  if (/^\/proof\/[1-9A-HJ-NP-Za-km-z]{10,}$/.test(route))
    await page.getByTestId("proof-verdict").waitFor({ timeout: 30_000 });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  const file = `${slug(route)}-${locale}-${width}.jpg`;
  await page.screenshot({
    path: path.join(OUT, file),
    type: "jpeg",
    quality: 70,
  });
  SHOTS.set(file, route);
  page.off("console", onConsole);
  expect
    .soft(overflow, `${route} ${locale} ${width}px scrolls sideways`)
    .toBeLessThanOrEqual(0);
  expect
    .soft(errors, `${route} ${locale} ${width}px console errors`)
    .toEqual([]);
}

for (const group of GROUPS) {
  const routes = group.routes.filter(inScope);
  if (routes.length === 0) continue; // SWEEP_ROUTES filtered this group out
  test(`sweep: ${group.role ?? routes[0]!.split("/")[1]!.split("?")[0]!}`, async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(600_000);
    await mockRpc(page);
    // Coach-mark tours (src/lib/tours.ts) would cover the very pages being reviewed — mark them done.
    await page.addInitScript(() => {
      for (const role of ["registrar", "issuer", "investor", "sandbox"])
        localStorage.setItem(`qupon.tour.${role}`, "done");
    });
    if (group.role) {
      if (group.role === "admin") {
        // No admin button on the login page: mock-only account via cookie (e2e/session.ts).
        await signInAs(page, "admin", baseURL);
      } else {
        await page.goto("/login");
        await page
          .getByRole("button", { name: new RegExp(`^${group.role}`, "i") })
          .click();
        await page.waitForURL(new RegExp(`/${group.role}`));
      }
    }
    for (const locale of ["en", "ru", "kk"]) {
      await context.addCookies([
        { name: "NEXT_LOCALE", value: locale, url: baseURL! },
      ]);
      for (const width of [1440, 390]) {
        for (const route of routes) {
          if (locale !== "en" && EN_ONLY(route)) continue; // #30: the gallery stays English
          await check(page, route, locale, width);
        }
      }
    }
  });
}

test.afterAll(() => {
  // Filtered re-shoots append to an existing index instead of dropping other tasks' rows.
  const indexPath = path.join(OUT, "index.md");
  const kept: [string, string][] = [];
  try {
    for (const line of readFileSync(indexPath, "utf8").split("\n")) {
      const m = line.match(/^\| `([^`]+)` \| `([^`]+)` \|$/);
      if (m && !SHOTS.has(m[1]!)) kept.push([m[1]!, m[2]!]);
    }
  } catch {
    // no index yet — write the first one
  }
  const rows = [...SHOTS, ...kept].sort(
    (a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]),
  );
  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    indexPath,
    `# Design sweep shots\n\nGenerated by \`apps/web/e2e/sweep.spec.ts\` (mock mode)${
      process.env.SWEEP_OUT
        ? ` with \`SWEEP_OUT=${process.env.SWEEP_OUT}\``
        : ""
    }: ${rows.length} screenshots, every route × en/ru/kk × 1440/390.\n\n| shot | route |\n| --- | --- |\n${rows
      .map(([file, route]) => `| \`${file}\` | \`${route}\` |`)
      .join("\n")}\n`,
  );
});

test("legacy links redirect to the new pages", async ({ page }) => {
  for (const [from, to] of [
    ["/console", /\/(registrar|login)/],
    [`/series/${MINT}`, new RegExp(`/bonds/${MINT}$`)],
    [`/actions/${INTR}`, /\/(registrar\/actions|login)/],
    ["/portal", /\/investor$/],
  ] as const) {
    await page.goto(from);
    await expect(page).toHaveURL(to);
  }
});
