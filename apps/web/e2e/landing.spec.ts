import { expect, test } from "@playwright/test";

test("landing: hero, five steps, RU, no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("#how li")).toHaveCount(5);
  await expect(page.locator("#simulated")).toContainText("Implemented");
  await page.getByRole("radio", { name: "Русский" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Купоны, погашения",
  );
  await page.getByRole("radio", { name: "English" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Every coupon",
  );
  expect(errors).toEqual([]);
});

test.describe("hero v2 (spec §5.8)", () => {
  for (const width of [390, 1440]) {
    test(`same hero height in EN and RU at ${width}px, nothing overflows`, async ({
      browser,
      baseURL,
    }) => {
      const heights: number[] = [];
      for (const locale of ["en", "ru"]) {
        const ctx = await browser.newContext({
          viewport: { width, height: 900 },
        });
        await ctx.addCookies([
          {
            name: "NEXT_LOCALE",
            value: locale,
            url: baseURL ?? "http://localhost:3000",
          },
        ]);
        const page = await ctx.newPage();
        await page.goto("/");
        const hero = page.locator("main section > div").first();
        heights.push((await hero.boundingBox())?.height ?? 0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await ctx.close();
      }
      expect(heights[0]).toBeGreaterThan(0);
      expect(heights[0]).toBe(heights[1]);
    });
  }

  test("the lifecycle card replays the action, then completes", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText(/Step \d of 6/)).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("All 6 steps on-chain")).toBeVisible({
      timeout: 12_000,
    });
  });

  test.describe("reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("the card stays on the completed action", async ({ page }) => {
      await page.goto("/");
      await page.waitForTimeout(2_500);
      await expect(page.getByText("All 6 steps on-chain")).toBeVisible();
      await expect(page.getByText(/Step \d of 6/)).toHaveCount(0);
    });
  });
});

test("platform v2 section and the investor sign-up link (task 1109)", async ({
  page,
}) => {
  await page.goto("/");
  const platform = page.locator("#platform");
  await platform.scrollIntoViewIfNeeded();
  await expect(platform.getByRole("heading", { level: 3 })).toHaveCount(6);
  await expect(platform.getByText("Tenge on Solana")).toBeVisible();
  await page
    .locator("#investors")
    .getByRole("link", { name: "Create an account" })
    .click();
  await expect(page).toHaveURL(/\/signup$/);
});
