import { expect, type Page, test } from "@playwright/test";
import { signInAs } from "./session";

/**
 * Task 1531, the guidance system: the NowBar names the right next step (and who may push it) for every action
 * status; the role tours open, step, close, stay closed and restart from the help menu; a glossary term opens and
 * closes from the keyboard; /learn renders in every locale.
 */
test.use({ reducedMotion: "reduce" });

const MINT = "QpNb1Dem0BondMint1111111111111111111111111111";
const INTR = "ActnINTR0001Dem0PDA111111111111111111111111111";

const nowBar = (page: Page) => page.getByRole("region", { name: "Now", exact: true });
const tourCard = (page: Page) => page.locator("[data-tour-card]");

// status fixture → [NowBar title, who may push it]
const EXPECTED: [string, RegExp, string][] = [
  ["Announced", /^Next: Strike record date · QPNb1$/, "Anyone"],
  ["RecordStruck", /^Next: Snapshot holders · QPNb1$/, "Anyone"],
  ["SnapshotComplete", /^Next: Fund escrow · QPNb1$/, "Issuer"],
  ["Defaulted", /^Next: Fund escrow · QPNb1$/, "Issuer"],
  ["Funded", /^Next: Pay holders · QPNb1$/, "Anyone"],
  ["Settling", /^Next: Confirm bank payout · QPNb1$/, "Paying agent"],
  ["Retiring", /^Next: Retire bonds · QPNb1$/, "Anyone"],
  ["VotingOpen", /^QPNb1: holders are voting$/, "Holder"],
  ["Completed", /^QPNb1: every step is on-chain$/, ""],
];

test("the NowBar shows the next step and who may push it for each status fixture", async ({ page }) => {
  await page.goto("/ui");
  for (const [status, title, actor] of EXPECTED) {
    const bar = page.locator(`[data-fixture="${status}"]`).getByRole("region", { name: "Now", exact: true });
    await expect(bar.locator("p").first(), status).toHaveText(title);
    if (actor) await expect(bar.getByText(actor, { exact: true }), status).toBeVisible();
  }
  const fixture = (s: string) => page.locator(`[data-fixture="${s}"]`);
  // permissionless steps say so; time gates count down; a default is the loudest state
  await expect(fixture("Funded")).toContainText("Anyone can push this step");
  await expect(fixture("Announced")).toContainText(/Record date\s*in /);
  await expect(fixture("SnapshotComplete")).toContainText("Payment date");
  await expect(fixture("VotingOpen")).toContainText(/Voting ends\s*in /);
  await expect(fixture("Defaulted").locator("section")).toHaveClass(/bg-err-bg/);
  await expect(fixture("Completed")).toContainText("Done");
});

test("each cabinet shell has one NowBar: registrar, issuer, investor; the console keeps its own", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "registrar", baseURL);
  await page.goto("/registrar/actions");
  await expect(nowBar(page)).toHaveCount(1);
  await expect(nowBar(page)).toContainText(/^Now.*Next: /);
  await expect(nowBar(page).getByRole("link", { name: "Open action" })).toBeVisible();
  await page.goto(`/registrar/actions/${INTR}`);
  await expect(nowBar(page)).toHaveCount(1);

  await signInAs(page, "issuer", baseURL);
  await page.goto("/issuer/series");
  await expect(nowBar(page)).toHaveCount(1);

  await signInAs(page, "investor", baseURL);
  await page.goto("/investor/statements");
  await expect(nowBar(page)).toContainText("bondholder meeting");
  await expect(nowBar(page).getByText("Holder", { exact: true })).toBeVisible();
  await expect(nowBar(page).getByRole("link", { name: "Vote" })).toHaveAttribute("href", "/investor/meetings");
});

test("the registrar tour opens on its home page, steps, closes, stays closed and restarts from help", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "registrar", baseURL);
  await page.goto("/registrar");
  const card = tourCard(page);
  await expect(card.getByRole("dialog")).toBeVisible();
  await expect(card).toContainText("1 of 7");
  await card.getByRole("button", { name: "Next" }).click();
  await expect(card).toContainText("2 of 7");
  await expect(page.locator('[data-tour-active="true"]')).toHaveCount(1);
  await card.getByRole("button", { name: "Back" }).click();
  await expect(card).toContainText("1 of 7");
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(page.locator('[data-tour-active="true"]')).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(card).toHaveCount(0);

  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("button", { name: "Restart the tour" }).click();
  await expect(card).toContainText("1 of 7");
  // keyboard users land on the primary button: Enter advances
  await expect(card.getByRole("button", { name: "Next" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(card).toContainText("2 of 7");
  await card.getByRole("button", { name: "Skip tour" }).click();
  await expect(card).toHaveCount(0);
});

test("issuer, investor and sandbox tours have 6 to 9 steps", async ({ page, baseURL }) => {
  for (const [who, path, total] of [
    ["issuer", "/issuer", 7],
    ["investor", "/investor", 7],
    [null, "/sandbox/demo", 9],
  ] as const) {
    if (who) await signInAs(page, who, baseURL);
    await page.goto(path);
    await expect(tourCard(page), path).toContainText(`1 of ${total}`);
    await tourCard(page).getByRole("button", { name: "Skip tour" }).click();
    await expect(tourCard(page)).toHaveCount(0);
  }
});

test("a glossary term opens and closes from the keyboard", async ({ page }) => {
  await page.goto(`/bonds/${MINT}`);
  const term = page.locator("button.qp-term").first();
  await term.focus();
  await expect(term).toBeFocused();
  const pop = page.locator(".qp-gloss:popover-open");
  await expect(pop).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(pop).toHaveCount(1);
  await expect(pop).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pop).toHaveCount(0);
  await expect(term).toBeFocused();
});

test("/learn walks one coupon and lists the glossary in en, ru and kk", async ({ page, baseURL }) => {
  for (const [loc, h1] of [
    ["en", "How a bond lives on Qupon"],
    ["ru", "Как живёт облигация на Qupon"],
    ["kk", "Qupon-да облигация қалай өмір сүреді"],
  ] as const) {
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: loc, url: baseURL ?? "" }]);
    await page.goto("/learn");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
    expect(await page.locator("#glossary dt").count()).toBeGreaterThanOrEqual(20);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/learn");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
