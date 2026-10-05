import { expect, test } from "@playwright/test";

test("gallery: no console errors, visible focus, no overflow at 390 px", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/ui");
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(
    () => getComputedStyle(document.activeElement as Element).boxShadow,
  );
  expect(ring).toContain("69, 174, 106");
  await page.screenshot({
    path: "../../reports/ui/gallery-1440.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: "../../reports/ui/gallery-390.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
