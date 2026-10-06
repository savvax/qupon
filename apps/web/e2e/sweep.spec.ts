import { expect, test, type Page } from "@playwright/test";

// Screenshots must be byte-stable: emulated reduced motion turns every ambient animation
// (hero grid drift / card float, badge pops) and JS entrances into their final state (§5.6).
test.use({ reducedMotion: "reduce" });

// Every page × EN/RU × desktop/phone: no console errors (next-intl reports missing messages there), no
// horizontal scroll, and a screenshot for review in reports/ui/sweep/.
const MINT = "QpNb1Dem0BondMint1111111111111111111111111111";
const INTR = "ActnINTR0001Dem0PDA111111111111111111111111111";
const BMET = "ActnBMET0002Dem0PDA1111111111111111111111111111";

const GROUPS: {
  role?: "issuer" | "registrar" | "investor";
  routes: string[];
}[] = [
  { routes: ["/", "/bonds", `/bonds/${MINT}`, "/login", "/does-not-exist"] },
  {
    role: "issuer",
    routes: [
      "/issuer",
      "/issuer/series",
      "/issuer/series/new",
      `/issuer/series/${MINT}`,
    ],
  },
  {
    role: "registrar",
    routes: [
      "/registrar",
      "/registrar/actions",
      `/registrar/actions/${INTR}`,
      `/registrar/actions/${BMET}`,
      "/registrar/investors",
      "/registrar/activity",
      "/registrar/autopilot",
    ],
  },
  {
    role: "investor",
    routes: [
      "/investor",
      "/investor/placement",
      "/investor/meetings",
      "/investor/statements",
    ],
  },
];

const slug = (route: string) =>
  route
    .replace(/^\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .slice(0, 40) || "home";

async function check(page: Page, route: string, locale: string, width: number) {
  const errors: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() === "error" && !m.text().includes("Failed to load resource"))
      errors.push(m.text());
  };
  page.on("console", onConsole);
  await page.setViewportSize({ width, height: width > 500 ? 900 : 844 });
  await page.goto(route);
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  await page.screenshot({
    path: `../../reports/ui/sweep/${slug(route)}-${locale}-${width}.jpg`,
    type: "jpeg",
    quality: 70,
  });
  page.off("console", onConsole);
  expect
    .soft(overflow, `${route} ${locale} ${width}px scrolls sideways`)
    .toBeLessThanOrEqual(0);
  expect
    .soft(errors, `${route} ${locale} ${width}px console errors`)
    .toEqual([]);
}

for (const group of GROUPS) {
  test(`sweep: ${group.role ?? "public"}`, async ({
    page,
    context,
    baseURL,
  }) => {
    test.setTimeout(240_000);
    if (group.role) {
      await page.goto("/login");
      await page
        .getByRole("button", { name: new RegExp(`^${group.role}`, "i") })
        .click();
      await page.waitForURL(new RegExp(`/${group.role}`));
    }
    for (const locale of ["en", "ru"]) {
      await context.addCookies([
        { name: "NEXT_LOCALE", value: locale, url: baseURL! },
      ]);
      for (const width of [1440, 390]) {
        for (const route of group.routes)
          await check(page, route, locale, width);
      }
    }
  });
}

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
