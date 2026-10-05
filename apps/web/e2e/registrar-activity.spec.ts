import { expect, test, type Page } from "@playwright/test";

/** Sign in as the demo registrar (mock mode issues mock:registrar sessions). */
async function demoRegistrar(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /Registrar/ }).click();
  await expect(page).toHaveURL(/\/registrar$/);
}

const noOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

test("activity: on-chain events and the operator audit, EN + RU, 1440 + 390", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await demoRegistrar(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/registrar/activity");

  // On-chain tab lists ≥ 1 event (Badge prettifies camelCase kinds).
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Activity");
  const onchain = page.getByRole("table").first();
  await expect(onchain).toContainText("Action announced");
  await page.screenshot({
    path: "../../reports/ui/activity-en-1440.png",
    fullPage: true,
  });

  // Operator audit shows the investor onboarding write (Plan 3 Task 3 flow).
  await page.getByRole("tab", { name: "Operator audit" }).click();
  const audit = page.getByRole("table").first();
  await expect(audit).toContainText("POST /registrar/investors");
  await expect(audit).toContainText("OK");

  // RU renders the same page with real translations.
  await page.getByRole("button", { name: "ru", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Журнал");
  await expect(audit).toContainText("Успешно");
  await page.screenshot({
    path: "../../reports/ui/activity-ru-1440.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(await noOverflow(page)).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: "../../reports/ui/activity-ru-390.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "en", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Activity");
  await page.screenshot({
    path: "../../reports/ui/activity-en-390.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("autopilot: pending approval queue, approve runs the step, EN + RU, 1440 + 390", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await demoRegistrar(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/registrar/autopilot");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Autopilot approvals",
  );
  const pending = page.getByRole("table").first();
  await expect(pending).toContainText("step:strike_record");
  await expect(pending).toContainText("action:advance");
  await page.screenshot({
    path: "../../reports/ui/autopilot-en-1440.png",
    fullPage: true,
  });

  // Approve → pending toast → success toast with the tx link (mock proxy).
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Step executed")).toBeVisible();
  await expect(page.getByRole("link", { name: "Mock" })).toBeVisible();

  // Executed tab lists what already ran, with its transaction.
  await page.getByRole("tab", { name: /Executed/ }).click();
  await expect(page.getByRole("table").first()).toContainText(
    "step:snapshot_batch",
  );

  await page.getByRole("button", { name: "ru", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Согласование автопилота",
  );
  await page.screenshot({
    path: "../../reports/ui/autopilot-ru-1440.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(await noOverflow(page)).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: "../../reports/ui/autopilot-ru-390.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "en", exact: true }).click();
  await page.getByRole("tab", { name: /Pending/ }).click();
  await page.screenshot({
    path: "../../reports/ui/autopilot-en-390.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
