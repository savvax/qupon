import { expect, type Page, test } from "@playwright/test";

// Live e2e for platform v2 (task 1203): read-only walk of the new surfaces — no accounts or transactions created.
test.skip(!process.env.E2E_BASE_URL, "live e2e: set E2E_BASE_URL");

async function demo(page: Page, role: "Issuer" | "Registrar", home: RegExp) {
  await page.context().clearCookies();
  await page.goto("/login");
  const button = page.getByRole("button", {
    name: new RegExp(`^${role}`, "i"),
  });
  await expect(async () => {
    if (await button.isVisible()) await button.click();
    await expect(page).toHaveURL(home, { timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
}

test("@live v2 public surfaces: platform section, sign-up path, network", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.locator("#platform").getByRole("heading", { level: 3 }),
  ).toHaveCount(6);
  await page.goto("/login");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(
    page.getByRole("heading", { name: "Create an investor account" }),
  ).toBeVisible();
  // E2E_API_URL defaults to E2E_BASE_URL with qupon. → api., so a live run never mixes servers.
  const api =
    process.env.E2E_API_URL ??
    (process.env.E2E_BASE_URL ?? "").replace("//qupon.", "//api.");
  const net = await (await request.get(`${api}/network`)).json();
  expect(net).toMatchObject({ network: "devnet", mainnet: false });
  const assets = await (await request.get(`${api}/assets`)).json();
  expect(JSON.stringify(assets)).toMatch(/tKZT|KZTE-dev|dKZT/);
});

test("@live v2 back office: KYC queue, notifications bell, issuer organisation", async ({
  page,
}) => {
  await demo(page, "Registrar", /\/registrar$/);
  await page.goto("/registrar/kyc");
  await expect(
    page.getByRole("heading", { level: 1, name: "KYC queue" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Notifications, \d+ unread/ }),
  ).toBeVisible();
  await demo(page, "Issuer", /\/issuer$/);
  await page.goto("/issuer/organization");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/account/notifications");
  await expect(
    page.getByRole("heading", { level: 1, name: "Notifications" }),
  ).toBeVisible();
});
