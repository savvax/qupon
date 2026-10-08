import { expect, test } from "@playwright/test";
import { signInAs } from "./session";

test("investor: upload an ID, fill the details, send the application", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "member", baseURL);
  await page.goto("/investor/kyc");
  await expect(
    page.getByRole("heading", { name: "Verification" }),
  ).toBeVisible();
  // the mock member already has a linked wallet → the flow starts at documents
  await expect(
    page.getByRole("heading", { name: "Upload documents" }),
  ).toBeVisible();
  await page.getByLabel("Choose a file").setInputFiles({
    name: "passport.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% e2e\n"),
  });
  await expect(
    page.getByRole("heading", { name: "Your details" }),
  ).toBeVisible();
  await page.getByLabel("Full name (as in the document)").fill("Mira Member");
  await page.getByRole("combobox", { name: "Tax residency" }).click();
  await page.getByRole("option", { name: "Non-resident" }).click();
  await expect(page.getByText(/Withholding on coupons: 15\.00%/)).toBeVisible();
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("Under review").first()).toBeVisible();
  await expect(page.getByText(/You will get a notification/)).toBeVisible();
});

test("registrar: queue → application → approve registers the wallet in each issue", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "registrar", baseURL);
  await page.goto("/registrar/kyc");
  await expect(page.getByRole("heading", { name: "KYC queue" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Daniel Novak/ }).first(),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /Daniel Novak/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Daniel Novak" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "id-card.pdf" })).toHaveAttribute(
    "href",
    "/api/bo-get/documents/13",
  );
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(
    page.getByText("Approved: the investor is registered"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-ok=true]")).toHaveCount(2);
});

test("registrar: reject with a reason", async ({ page, baseURL }) => {
  await signInAs(page, "registrar", baseURL);
  await page.goto("/registrar/kyc/4");
  await page.getByRole("button", { name: "Reject" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Reject" })).toBeDisabled();
  await dialog.getByLabel("Reason").fill("Document expired");
  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Application rejected")).toBeVisible({
    timeout: 15_000,
  });
});

test("visitors without an account are invited to sign up; RU renders", async ({
  page,
  baseURL,
}) => {
  await page.goto("/investor/kyc");
  await expect(
    page.getByRole("heading", { name: "Create an account to get verified" }),
  ).toBeVisible();
  await page.context().addCookies([
    {
      name: "NEXT_LOCALE",
      value: "ru",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
  await page.goto("/investor/kyc");
  await expect(
    page.getByRole("heading", { name: "Верификация" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Создать аккаунт" }),
  ).toBeVisible();
});
