import { expect, test } from "@playwright/test";

// Live e2e (plan 4, task 4): runs only against a deployment — set E2E_BASE_URL.
// Real devnet: the demo issuer creates a fresh series (unique name, so existing
// data never collides) and it must be visible in the cabinet within the timeout.
test.skip(!process.env.E2E_BASE_URL, "live e2e: set E2E_BASE_URL");

test("@live issuer creates a series on devnet and sees it in /issuer/series", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const stamp = Date.now().toString(36);
  const name = `E2E-${stamp}`; // ≤ 16 chars; the E2E- prefix keeps this test series off the public board (showcase seed hides it)
  const isin = `KZ${stamp.toUpperCase()}Q7`; // 2 letters + 9 alnum + digit

  await page.goto("/login?next=/issuer");
  await page.getByRole("button", { name: /^Issuer/i }).click();
  await expect(page).toHaveURL(/\/issuer$/);

  await expect(async () => {
    // Dev servers occasionally abort the first full navigation right after a
    // client-side sign-in redirect; the deployment is unaffected. Retry once.
    await page.goto("/issuer/series/new");
  }).toPass({ timeout: 30_000 });
  await page.getByLabel("Series name").fill(name);
  await page.getByLabel("ISIN").fill(isin);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("heading", { name: /coupons/ }).waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Issue on Solana" }).click();
  // One devnet tx set: mint + series init (brief says ≤ 90 s).
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`${name} is live on devnet`),
    }),
  ).toBeVisible({ timeout: 90_000 });

  await expect(async () => {
    await page.goto("/issuer/series");
    await expect(
      page.getByRole("link", { name: new RegExp(name) }),
    ).toBeVisible();
  }).toPass({ timeout: 60_000 });
});
