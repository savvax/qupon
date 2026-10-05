import { expect, test, type Page } from "@playwright/test";

// Live e2e (plan 4, task 4): runs only against a deployment — set E2E_BASE_URL.
test.skip(!process.env.E2E_BASE_URL, "live e2e: set E2E_BASE_URL");

const PAGES = ["/", "/bonds", "/login"];

test("@live public pages return 200 with no console errors", async ({
  page,
}: {
  page: Page;
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    // 4xx/5xx resources surface as console errors; the page-level status is asserted below.
    if (m.type() === "error" && !m.text().includes("Failed to load resource"))
      errors.push(m.text());
  });
  for (const path of PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveTitle(/· Qupon$/);
  }
  expect(errors).toEqual([]);
});
