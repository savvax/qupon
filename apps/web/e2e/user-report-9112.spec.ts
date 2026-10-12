import { expect, test } from "@playwright/test";
import { signInAs } from "./session";

// User report 2026-10-06 (task 9112).

for (const width of [1440, 390])
  test(`wizard: the Import button sits on the ticker input's row at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await signInAs(page, "issuer", baseURL);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/issuer/series/new");
    const input = page.getByLabel("KASE ticker");
    const button = page.getByRole("button", { name: "Import" });
    await expect(button).toBeVisible();
    const [i, b] = [
      (await input.boundingBox())!,
      (await button.boundingBox())!,
    ];
    expect(Math.abs(i.y - b.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(i.height - b.height)).toBeLessThanOrEqual(1);
  });

test("landing demo button offers the role choice to a signed-in visitor and switches roles", async ({
  page,
  baseURL,
}) => {
  // Right after sweep.spec's 8-minute load the dev server can take >90 s to answer the demo
  // POST (the button disables itself while pending, so only the budget helps). Observed 30-92 s.
  test.setTimeout(240_000);
  await signInAs(page, "issuer", baseURL);
  await page.goto("/");
  // The landing's demo entry is "Try as …" since the showcase refresh (task 1535).
  // A click before hydration is lost: retry until the navigation really happens.
  const investor = page.getByRole("link", { name: "Try as investor" });
  await expect(async () => {
    if (await investor.isVisible()) await investor.click();
    await expect(page).toHaveURL(/\/login\?choose=1$/, { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await expect(
    page.getByText(/You are signed in as .+\(Issuer\)/),
  ).toBeVisible();
  const registrar = page.getByRole("button", { name: /^Registrar/ });
  await expect(async () => {
    if (await registrar.isVisible()) await registrar.click();
    await expect(page).toHaveURL(/\/registrar$/, { timeout: 5_000 });
  }).toPass({ timeout: 200_000 }); // cold on-demand compile of /registrar under load takes >30 s (seen in full-suite runs)
});

test("a protected link followed by another demo role lands in that role's cabinet", async ({
  page,
}) => {
  await page.goto("/issuer");
  await expect(page).toHaveURL(/\/login\?next=%2Fissuer/);
  const registrar = page.getByRole("button", { name: /^Registrar/ });
  await expect(async () => {
    if (await registrar.isVisible()) await registrar.click();
    await expect(page).toHaveURL(/\/registrar$/, { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
});
