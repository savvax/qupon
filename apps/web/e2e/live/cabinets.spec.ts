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
    await page
      .getByRole("button", { name: new RegExp(`^${role}`, "i") })
      .click();
    await expect(page).toHaveURL(home);
    // The topbar DEMO pill (the investor portfolio adds a second pill in main).
    await expect(
      page.getByRole("banner").getByText("DEMO", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});
