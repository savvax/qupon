import { expect, test } from "@playwright/test";
import { signInAs } from "./session";

const QPNB1 = "QpNb1Dem0BondMint1111111111111111111111111111";

test("issuer: organisation and team pages render, demo is read-only", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "issuer", baseURL);
  await page.goto("/issuer/organization");
  await expect(
    page.getByRole("heading", { name: "Organisation" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Demo accounts are shared by every visitor/),
  ).toBeVisible();

  await page.goto("/issuer/team");
  await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
  // the shared demo identity cannot invite — the note says so instead of the button
  await expect(
    page.getByRole("button", { name: "Invite a member" }),
  ).toHaveCount(0);
  await expect(page.getByText(/the team cannot be changed/)).toBeVisible();
});

test("invite link: accept joins the organisation, a used token is refused", async ({
  page,
}) => {
  await page.goto("/invite/MockInviteTokenThatWorks11111111111111111");
  await expect(
    page.getByRole("heading", { name: "Accept your invitation" }),
  ).toBeVisible();
  await page.getByLabel("Full name").fill("Nurbek Newcomer");
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account and join" }).click();
  await expect(page).toHaveURL(/\/issuer$/);

  await page.context().clearCookies();
  await page.goto("/invite/used");
  await page.getByLabel("Full name").fill("Nurbek Newcomer");
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account and join" }).click();
  await expect(
    page.getByText(/unknown, already used or expired/),
  ).toBeVisible();
});

test("bond page lists the series' public documents; RU renders", async ({
  page,
  baseURL,
}) => {
  await page.goto(`/bonds/${QPNB1}`);
  await expect(
    page.getByRole("heading", { name: "Issue documents" }),
  ).toBeVisible();
  // public page: the link points straight at the registrar API (no session needed)
  await expect(
    page.getByRole("link", { name: "Download" }).first(),
  ).toHaveAttribute("href", /\/documents\/21$/);
  await expect(page.getByText("prospectus-2026-en.pdf")).toBeVisible();

  await page.context().addCookies([
    {
      name: "NEXT_LOCALE",
      value: "ru",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
  await page.goto(`/bonds/${QPNB1}`);
  await expect(
    page.getByRole("heading", { name: "Документы выпуска" }),
  ).toBeVisible();
});
