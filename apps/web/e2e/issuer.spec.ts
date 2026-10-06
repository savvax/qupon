import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/login?next=/issuer");
  await page.getByRole("button", { name: /Issuer/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Demo issuer",
  );
});

test("new-series wizard: validation, schedule preview, one request on double click", async ({
  page,
}) => {
  await page.goto("/issuer/series/new");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText("Use 1–16 letters, digits or dashes."),
  ).toBeVisible();

  await page.getByLabel("Series name").fill("E2E-1");
  await page.getByLabel("ISIN").fill("KZ2C00012345");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "4 coupons" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  let posts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/bo/issuer/series"))
      posts++;
  });
  await page.getByRole("button", { name: "Issue on Solana" }).dblclick();
  await expect(
    page.getByRole("heading", { name: /E2E-1 is live on devnet/ }),
  ).toBeVisible();
  expect(posts).toBe(1);
});

test("a series with an open action hides announce; the dashboard lists latest actions", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Latest corporate actions" }),
  ).toBeVisible();
  await page.goto(
    "/issuer/series/QpNb1Dem0BondMint1111111111111111111111111111",
  );
  await expect(page.getByText(/Open corporate action/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Announce" })).toHaveCount(0);
});

test("issuer cannot open the registrar cabinet", async ({ page }) => {
  await page.goto("/registrar/actions");
  await expect(page).toHaveURL(/\/forbidden\?role=issuer/);
});

test("wizard pays in any enabled cash asset: KZTE-dev goes out as cashMint", async ({
  page,
}) => {
  await page.goto("/issuer/series/new");
  await page.getByLabel("Series name").fill("E2E-KZTE");
  await page.getByLabel("ISIN").fill("KZ2C00012345");
  await page.getByRole("combobox", { name: "Paid in" }).click();
  await page.getByRole("option", { name: /KZTE-dev — Evo tenge/ }).click();
  await expect(page.getByText("₸").first()).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  const req = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/api/bo/issuer/series"),
  );
  await page.getByRole("button", { name: "Issue on Solana" }).click();
  const body = (await req).postDataJSON() as Record<string, unknown>;
  expect(body.cashMint).toBe("KZTEdevMint11111111111111111111111111111111");
  expect(body.cash).toBeUndefined();
  expect(body.faceValue).toBe(100000); // 1,000 major units at 2 decimals
});
