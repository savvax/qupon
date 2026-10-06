import { expect, test } from "@playwright/test";

// Live e2e (plan 4, task 4): runs only against a deployment — set E2E_BASE_URL.
test.skip(!process.env.E2E_BASE_URL, "live e2e: set E2E_BASE_URL");

// Well-formed but unknown ids: the redirect fires on the URL pattern alone, and the
// target page must render calmly (bond detail → designed 404, cabinets → login).
const MINT = "E2ELegacyMint11111111111111111111111111111";
const PDA = "E2ELegacyPda111111111111111111111111111111";

const REDIRECTS: readonly (readonly [
  from: string,
  to: string,
  final: RegExp,
])[] = [
  ["/console", "/registrar", /\/login\?next=%2Fregistrar$/],
  [`/series/${MINT}`, `/bonds/${MINT}`, new RegExp(`/bonds/${MINT}$`)],
  [
    `/actions/${PDA}`,
    `/registrar/actions/${PDA}`,
    // The cabinet layout redirects to next=/registrar (path not preserved).
    /\/login\?next=%2Fregistrar$/,
  ],
  ["/portal", "/investor", /\/investor$/],
  ["/kitchen-sink", "/ui", /\/ui$/],
];

test("@live legacy links redirect to the new pages (307/308)", async ({
  page,
}) => {
  const base = process.env.E2E_BASE_URL ?? "";
  for (const [from, to, final] of REDIRECTS) {
    const res = await fetch(`${base}${from}`, { redirect: "manual" });
    expect([307, 308], from).toContain(res.status);
    expect(res.headers.get("location"), from).toBe(to);
    const nav = await page.goto(from);
    await expect(page).toHaveURL(final);
    // The landing page renders calmly (bond detail for an unknown mint → designed 404).
    expect(nav?.status(), from).toBeLessThan(500);
  }
});
