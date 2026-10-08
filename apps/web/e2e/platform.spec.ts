import { expect, test } from "@playwright/test";
import { signInAs } from "./session";
import { injectWallets } from "./wallets";

/**
 * Cross-feature platform journey (task 1201, mock mode): one investor walks
 * sign-up → wallet link (mock signer) → faucet → KYC → registrar approval →
 * notification → statement CSV; one admin walks issuer-in-an-org → invite
 * accept → the issuer's org-scoped cabinet. The mock registrar is stateful
 * per dev server, so the journey runs in order (workers: 1).
 */
test.describe.configure({ mode: "serial" });

const QPNB1 = "QpNb1Dem0BondMint1111111111111111111111111111";

test("investor: sign up, link a wallet with the mock signer, take the faucet", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await injectWallets(page, ["Phantom", "Solflare"]);

  // Sign-up (task 802): the form starts a session and lands on /investor.
  await page.goto("/login");
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill("Aigerim Seitkali");
  await page.getByLabel("Email").fill("aigerim@example.kz");
  await page.getByLabel("Password").fill("steppe-bonds-2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/investor$/, { timeout: 15_000 });
  await expect(
    page.locator("section[aria-labelledby^=onboarding]"),
  ).toHaveCount(1);

  // Wallet link (task 801): connect the second fake wallet and sign the challenge.
  await page.goto("/account");
  await page
    .getByRole("main")
    .getByRole("button", { name: "Connect wallet" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Solflare/ }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Sign and link" }).click();
  await expect(page.getByText("Wallet linked")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("7XVB…tLau").first()).toBeVisible();

  // Faucet (task 603/808): test cash closes the onboarding row.
  await page.goto("/investor");
  await page.getByRole("button", { name: "Get KZTE-dev" }).click();
  await expect(page.getByText("Test KZTE-dev is on its way")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator("li[data-key=testCashReceived]")).toHaveAttribute(
    "data-done",
    "true",
    { timeout: 15_000 },
  );
  expect(errors).toEqual([]);
});

test("investor: KYC application goes to the registrar queue", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInAs(page, "member", baseURL); // the self-registered account of step 1

  await page.goto("/investor/kyc");
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
  await page
    .getByLabel("Full name (as in the document)")
    .fill("Aigerim Seitkali");
  await page.getByRole("combobox", { name: "Tax residency" }).click();
  await page.getByRole("option", { name: "Non-resident" }).click();
  await page.getByRole("button", { name: "Send for review" }).click();
  await expect(page.getByText("Under review").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("registrar approves; the investor is notified and downloads the statement CSV", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  // Registrar side (tasks 803/804): the queue lists the application, approve registers the wallet.
  await signInAs(page, "registrar", baseURL);
  await page.goto("/registrar/kyc");
  await page
    .getByRole("link", { name: /Aigerim Seitkali/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Aigerim Seitkali" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(
    page.getByText("Approved: the investor is registered"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-ok=true]")).toHaveCount(1); // one series (QPNb1)

  // Investor side: the decision is in the notification list (task 805)…
  await signInAs(page, "member", baseURL);
  await page.goto("/account/notifications");
  await expect(page.getByText("Verification approved")).toBeVisible();

  // …the payment notification leads to the statements, the report to the CSV (task 901).
  await page.goto("/investor");
  await page.getByRole("button", { name: /Notifications/ }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await panel.getByText("QPNb1: payment received").click();
  await expect(page).toHaveURL(/\/investor\/statements$/);

  await page.goto("/investor/reports");
  await expect(
    page.locator("a[href='/api/bo-get/me/reports/statement?format=csv']"),
  ).toBeVisible();
  const res = await page.request.get(
    `${baseURL}/api/bo-get/me/reports/statement?format=csv`,
  );
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body.startsWith("\ufeff")).toBe(true); // UTF-8 BOM
  expect(body).toContain("payment_date,series,isin");
  expect(body).toContain("# report,statement");
  // the brief's numbers: the coupon and the redemption principal
  expect(body).toContain("500.00");
  expect(body).toContain("10000.00"); // redemption principal, 10 × 1,000 KZT
  expect(errors).toEqual([]);
});

test("admin: issuer in an organisation → invite accept → only the org's series", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  // Admin creates an issuer inside Demo Issuer JSC (tasks 701/703).
  await signInAs(page, "admin", baseURL);
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Create user" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill("nurbek@bastau.kz");
  await dialog.getByLabel("Full name").fill("Nurbek Newcomer");
  await dialog.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("option", { name: "Issuer" }).click();
  await dialog.getByRole("combobox", { name: "Organisation" }).click();
  await page.getByRole("option", { name: "Demo Issuer JSC" }).click();
  await dialog.getByLabel("Initial password").fill("first-password-123");
  await dialog.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByText("User created")).toBeVisible({
    timeout: 15_000,
  });
  const row = page.getByRole("row").filter({ hasText: "nurbek@bastau.kz" });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("Demo Issuer JSC");
  await expect(row.getByText("Issuer", { exact: true })).toBeVisible();

  // The invite (task 807, delivery SIMULATED): accept joins the organisation.
  await page.context().clearCookies();
  await page.goto("/invite/MockInviteTokenThatWorks1111111111111111111111");
  await expect(
    page.getByRole("heading", { name: "Accept your invitation" }),
  ).toBeVisible();
  await page.getByLabel("Full name").fill("Nurbek Newcomer");
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account and join" }).click();
  await expect(page).toHaveURL(/\/issuer$/);

  // Org scoping (issuerOwnsSeries, task 807): the cabinet lists the org's
  // QPNb1, never the unassigned BTRKdemo.
  await expect(
    page.getByRole("heading", { name: "Latest corporate actions" }),
  ).toBeVisible();
  await expect(page.getByText("QPNb1").first()).toBeVisible();
  await expect(page.getByText("BTRKdemo")).toHaveCount(0);
  await page.goto("/issuer/organization");
  // demo identity: the profile itself is read-only (task 807), the boundary is the scoping above
  await expect(
    page.getByRole("heading", { name: "Organisation" }),
  ).toBeVisible();
  await expect(
    page.getByText(/organisation profile is read-only/),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
