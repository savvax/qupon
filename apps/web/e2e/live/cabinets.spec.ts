import { expect, test } from "@playwright/test";

// Live e2e (plan 4, task 4): runs only against a deployment — set E2E_BASE_URL.
test.skip(!process.env.E2E_BASE_URL, "live e2e: set E2E_BASE_URL");

const ROLES = [
  ["Issuer", /\/issuer$/],
  ["Registrar", /\/registrar$/],
  ["Investor", /\/investor$/],
] as const;

test("@live demo sign-in reaches each cabinet", async ({ page, context }) => {
  for (const [role, home] of ROLES) {
    // A signed-in user is redirected away from /login — start each role fresh.
    await context.clearCookies();
    await page.goto("/login");
    // A click that lands before hydration does nothing: retry until the sign-in navigates.
    const button = page.getByRole("button", { name: new RegExp(`^${role}`, "i") });
    await expect(async () => {
      if (await button.isVisible()) await button.click();
      await expect(page).toHaveURL(home, { timeout: 5_000 });
    }).toPass({ timeout: 60_000 });
    // The topbar DEMO pill (the investor portfolio adds a second pill in main).
    await expect(
      page.getByRole("banner").getByText("DEMO", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
