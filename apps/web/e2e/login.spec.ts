import { expect, test } from "@playwright/test";

test("demo registrar signs in, lands on /registrar; the cookie is httpOnly", async ({
  page,
  context,
}) => {
  await page.goto("/registrar");
  await expect(page).toHaveURL(/\/login\?next=%2Fregistrar/);
  await page.getByRole("button", { name: /Registrar/ }).click();
  await expect(page).toHaveURL(/\/registrar$/);
  await expect(page.getByText("DEMO", { exact: true })).toBeVisible();
  const cookie = (await context.cookies()).find(
    (c) => c.name === "qupon_session",
  );
  expect(cookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "qupon_session",
  );
});

test("wrong role goes to /forbidden; sign out returns to /login", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /Issuer/ }).click();
  await expect(page).toHaveURL(/\/issuer$/);
  await page.goto("/registrar");
  await expect(page).toHaveURL(/\/forbidden\?role=issuer/);
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/issuer");
  await expect(page).toHaveURL(/\/login\?next=%2Fissuer/);
});

test("the write proxy refuses paths outside the back office and anonymous writes", async ({
  request,
}) => {
  const auth = await request.post("/api/bo/auth/login", {
    data: { email: "x", password: "y" },
  });
  expect(auth.status()).toBe(403);
  const anon = await request.post("/api/bo/registrar/investors", { data: {} });
  expect(anon.status()).toBe(401);
});

test("next= cannot redirect off-site", async ({ page }) => {
  await page.goto("/login?next=//evil.example");
  await page.getByRole("button", { name: /Investor/ }).click();
  await expect(page).toHaveURL(/\/investor$/);
});

test("demo sign-in works without JavaScript (form post + redirect)", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/login?next=/registrar/actions");
  await page.getByRole("button", { name: /^Registrar/ }).click();
  await expect(page).toHaveURL(/\/registrar\/actions$/);
  await ctx.close();
});
