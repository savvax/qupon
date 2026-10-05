import { expect, test } from "@playwright/test";

/**
 * UI smoke tests against the mock registrar API (API_MOCKING=enabled).
 * Pubkeys/ids mirror src/mocks/api.ts fixtures.
 */
const MINT_QPNB1 = "QpNb1Dem0BondMint1111111111111111111111111111";
const ACTION_DONE = "ActnINTR0001Dem0PDA111111111111111111111111111"; // INTR, Completed
const ACTION_VOTING = "ActnBMET0002Dem0PDA1111111111111111111111111111"; // BMET, VotingOpen

test("series list renders both series and links to the series page", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Bond series" }),
  ).toBeVisible();
  const row = page.getByRole("row", { name: /QPNb1/ });
  await expect(row).toContainText("KZ2C0QUPON01");
  await expect(row).toContainText("10.00");
  await expect(page.getByRole("row", { name: /BTRKdemo/ })).toContainText(
    "15.95",
  );
  await page.getByRole("link", { name: "QPNb1" }).click();
  await expect(page).toHaveURL(new RegExp(`/series/${MINT_QPNB1}$`));
});

test("series page shows terms, schedule, holders and corporate actions", async ({
  page,
}) => {
  await page.goto(`/series/${MINT_QPNB1}`);
  await expect(page.getByRole("heading", { name: "QPNb1" })).toBeVisible();

  // terms
  await expect(page.getByText("KZ2C0QUPON01")).toBeVisible();
  await expect(page.getByText("1,000.00", { exact: false })).toBeVisible();

  // coupon schedule: 4 rows, first linked to the announced action
  const schedule = page.locator("h2:has-text('Coupon schedule') + div table");
  await expect(schedule.getByRole("row")).toHaveCount(5); // header + 4 coupons
  await expect(
    schedule.getByRole("link", { name: "Announced" }),
  ).toHaveAttribute("href", `/actions/${ACTION_DONE}`);

  // holders: brief's 10/25/65 units
  const holders = page.locator("h2:has-text('Holders (3)') + div table");
  for (const units of ["10", "25", "65"]) {
    await expect(
      holders.getByRole("cell", { name: units, exact: true }),
    ).toBeVisible();
  }

  // corporate actions link to their pages
  const actions = page.locator(
    "h2:has-text('Corporate actions (2)') + div table",
  );
  const intrRow = actions.getByRole("row", { name: /QPNb1-INTR-0001/ });
  await expect(intrRow.getByText("Completed")).toBeVisible();
  await expect(intrRow.getByRole("link", { name: "open →" })).toHaveAttribute(
    "href",
    `/actions/${ACTION_DONE}`,
  );
});

test("completed action page: timeline all steps done, entitlements, downloads, SIMULATED badges", async ({
  page,
}) => {
  await page.goto(`/actions/${ACTION_DONE}`);
  await expect(
    page.getByRole("heading", { name: "QPNb1-INTR-0001" }),
  ).toBeVisible();
  await expect(page.getByTitle("Completed")).toBeVisible();
  await expect(page.getByText("action completed")).toBeVisible();

  // timeline: 7 INTR steps, all marked done (emerald dot)
  const timeline = page.locator("ol").first();
  await expect(timeline.locator("li")).toHaveCount(7);
  await expect(timeline.locator("li .bg-emerald-500")).toHaveCount(7);
  for (const label of [
    "Announce",
    "Strike record date",
    "Snapshot holders",
    "Finalize",
    "Fund escrow (issuer)",
    "Pay holders",
    "Complete",
  ]) {
    await expect(timeline.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(timeline.getByText("3/3 holders paid")).toBeVisible();
  // every executed step carries a devnet explorer tx link
  await expect(
    timeline.locator("a[href*='explorer.solana.com/tx/']"),
  ).toHaveCount(7);

  // funding panel reflects the completed payment
  await expect(page.getByText("fully funded")).toBeVisible();

  // entitlements: brief's 500 / 1250 / 3250 KZT (mock display strings), paid tx links
  await expect(page.getByText("Entitlements (3)")).toBeVisible();
  for (const amount of ["500.00", "1250.00", "3250.00"]) {
    await expect(
      page.getByText(amount, { exact: false }).first(),
    ).toBeVisible();
  }
  const ents = page.locator("h2:has-text('Entitlements') + div table");
  await expect(ents.locator("a[href*='explorer.solana.com/tx/']")).toHaveCount(
    3,
  );

  // downloads: ISO 20022 links (absolute API_BASE_URL) + SIMULATED Swift delivery badge
  await expect(page.getByRole("link", { name: /seev\.031/ })).toHaveAttribute(
    "href",
    /\/actions\/[^/]+\/iso\/seev031\.xml$/,
  );
  await expect(page.getByRole("link", { name: /seev\.036/ })).toHaveAttribute(
    "href",
    /\/actions\/[^/]+\/iso\/seev036\.zip$/,
  );
  await expect(page.getByText("SIMULATED · Swift delivery")).toBeVisible();

  // notice panel renders the mock notice and marks publication simulated
  await expect(page.getByText("KASE notice")).toBeVisible();
  await expect(page.getByText("NOTICE (DEMO)")).toBeVisible();
  await expect(
    page.getByText(/SIMULATED — publication on kase\.kz/),
  ).toBeVisible();
});

test("in-flight BMET action page: voting state with pending steps", async ({
  page,
}) => {
  await page.goto(`/actions/${ACTION_VOTING}`);
  await expect(
    page.getByRole("heading", { name: "QPNb1-BMET-0002" }),
  ).toBeVisible();
  await expect(page.getByTitle("VotingOpen")).toBeVisible();
  await expect(page.getByText("voting still open")).toBeVisible();
  await expect(page.getByText("Bondholder meeting")).toBeVisible();
  await expect(page.getByText("0/100 units voted")).toBeVisible();

  // 7 BMET steps: announce..votes done, meet_finalize current, apply pending
  const timeline = page.locator("ol").first();
  await expect(timeline.locator("li")).toHaveCount(7);
  await expect(timeline.locator("li .bg-emerald-500")).toHaveCount(5);
  await expect(timeline.locator("li .animate-pulse")).toHaveCount(1);
  await expect(
    timeline.getByText("Apply terms change (ARDFM registration — SIMULATED)"),
  ).toBeVisible();

  // entitlements exist (snapshot) but nothing paid yet
  const ents = page.locator("h2:has-text('Entitlements') + div table");
  await expect(ents.locator("a[href*='explorer.solana.com/tx/']")).toHaveCount(
    0,
  );
});
