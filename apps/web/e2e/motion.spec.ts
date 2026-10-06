import { expect, type Page, test } from "@playwright/test";
import { signInAs } from "./session";

/** Record every text a KPI value shows (MutationObserver from the first byte of every document). */
async function recordKpis(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __kpi: string[] };
    w.__kpi = [];
    new MutationObserver((list) => {
      for (const m of list) {
        const el = (
          m.target.nodeType === 3 ? m.target.parentElement : m.target
        ) as Element | null;
        if (el?.closest(".num")) w.__kpi.push(el.textContent ?? "");
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
}

const kpiTexts = (page: Page) =>
  page.evaluate(() => (window as unknown as { __kpi: string[] }).__kpi);

async function toDashboardClientSide(page: Page) {
  await page.goto("/registrar/actions");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __kpi: string[] }).__kpi = [];
  });
  await page.getByRole("link", { name: "Dashboard" }).first().click();
  await expect(page).toHaveURL(/\/registrar$/);
  await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
  await page.waitForTimeout(1200); // count-up is 0.7 s
}

test("server HTML never hides content (no entrance styles on first load)", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "registrar", baseURL);
  const html = await (await page.request.get("/registrar")).text();
  expect(html).not.toMatch(/opacity:\s*0/);
  // Task 1102: staggered table rows (registrar tables) and bond KPI cards — same rule on /bonds.
  const bonds = await (await page.request.get("/bonds")).text();
  expect(bonds).not.toMatch(/opacity:\s*0/);
});

test("KPI numbers count up after a client-side navigation", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "registrar", baseURL);
  await recordKpis(page);
  await toDashboardClientSide(page);
  const seen = await kpiTexts(page);
  expect(seen).toContain("0"); // started from zero
  await expect(page.locator(".num").first()).not.toHaveText("0");
});

test("tabs and the cabinet nav move one shared highlight (tasks 1105/1108)", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "registrar", baseURL);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/registrar/actions");
  const nav = page.getByRole("navigation", { name: /./ }).first();
  await expect(nav.locator("[aria-current=page] span.absolute")).toHaveCount(1);
  const tabs = page.getByRole("tab");
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1).locator("span.absolute")).toHaveCount(1);
  await expect(tabs.nth(0).locator("span.absolute")).toHaveCount(0);
});

test("hero card: pearl surface drifts and follows the pointer", async ({
  page,
}) => {
  await page.goto("/");
  const card = page.locator(".qp-pearl");
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "qp-pearl",
  );
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
  await expect
    .poll(() => card.evaluate((el) => el.style.getPropertyValue("--qp-px")))
    .toMatch(/^2\d(\.\d+)?%$/);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("KPI numbers never count; dialogs and pages appear at once", async ({
    page,
    baseURL,
  }) => {
    await signInAs(page, "registrar", baseURL);
    await recordKpis(page);
    await toDashboardClientSide(page);
    expect(await kpiTexts(page)).not.toContain("0");
    const opacity = await page
      .locator("main > div")
      .first()
      .evaluate((el) => getComputedStyle(el).opacity);
    expect(opacity).toBe("1");
  });

  test("ambient loops are frozen (hero pearl, iris, sweep)", async ({
    page,
  }) => {
    await page.goto("/");
    const durations = await page.evaluate(() =>
      [".qp-pearl", ".animate-qp-iris-a", ".animate-qp-sweep"].map((sel) => {
        const el = document.querySelector(sel);
        return el ? parseFloat(getComputedStyle(el).animationDuration) : -1;
      }),
    );
    for (const d of durations) expect(d).toBeGreaterThanOrEqual(0);
    for (const d of durations) expect(d).toBeLessThan(0.01);
  });
});
