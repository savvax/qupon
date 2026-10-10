// Temporary verification for task 91537 round 2 — not committed.
import { expect, test } from "@playwright/test";

const headings: Record<string, { section: RegExp; terms: string[] }> = {
  en: { section: /Six mechanics under the hood/i, terms: ["Payout route", "Grace day", "Anchored notice"] },
  ru: { section: /Шесть механик под капотом/i, terms: ["Маршрут выплаты", "Льготный день", "Закреплённое уведомление"] },
  kk: { section: /Қаптастың астындағы алты механика/i, terms: ["Төлем бағыты", "Жеңілдік күні", "Бекітілген хабарлама"] },
};
const check = (locale: string): { section: RegExp; terms: string[] } => {
  const h = headings[locale];
  if (!h) throw new Error(`unknown locale ${locale}`);
  return h;
};

test("learn plan-15 section + glossary present, no truncated labels", async ({ page }) => {
  for (const locale of ["en", "ru", "kk"]) {
    await page.goto(`/${locale}/learn`);
    await expect(page.getByRole("heading", { name: check(locale).section })).toBeVisible();
    for (const term of check(locale).terms) {
      await expect(page.getByText(term, { exact: false }).first()).toBeVisible();
    }
    // every plan-15 card label fully visible (no horizontal overflow of its text)
    const overflowing = await page.evaluate(() => {
      const bad: string[] = [];
      document.querySelectorAll("h3").forEach((h) => {
        if (h.scrollWidth > h.clientWidth + 1) bad.push(h.textContent ?? "");
      });
      return bad;
    });
    expect(overflowing, locale).toEqual([]);
  }
});
