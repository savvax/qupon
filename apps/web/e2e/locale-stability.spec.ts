import { expect, type Page, test } from "@playwright/test";

/**
 * Switching EN ↔ RU must not move or resize controls (spec §5.8): every button, button-styled link, h1 and
 * paragraph on these pages has the same box in both languages, on desktop and phone.
 */
test.use({ reducedMotion: "reduce" });

const PAGES: { who?: string; path: string }[] = [
  { path: "/" },
  { path: "/login" },
  { path: "/bonds" },
  { path: "/investor" },
  { who: "registrar", path: "/registrar" },
  { who: "issuer", path: "/issuer/series/new" },
  { who: "member", path: "/account" },
];

type Box = {
  tag: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

async function boxes(
  page: Page,
  path: string,
  who: string | undefined,
  locale: string,
  url: string,
): Promise<Box[]> {
  await page.context().clearCookies();
  const cookies = [{ name: "NEXT_LOCALE", value: locale, url }];
  if (who) cookies.push({ name: "qupon_session", value: `mock:${who}`, url });
  await page.context().addCookies(cookies);
  await page.goto(path, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  return page.evaluate(() =>
    [
      ...document.querySelectorAll(
        "header button, header a, main button, main a[class*='rounded-btn'], h1, main p",
      ),
    ]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top < 1400;
      })
      .map((e) => {
        const r = e.getBoundingClientRect();
        return {
          tag: e.tagName,
          text: (e.textContent ?? "").trim().slice(0, 24),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      }),
  );
}

for (const width of [1440, 390])
  test(`controls keep their boxes in EN and RU at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: 900 });
    const diffs: string[] = [];
    for (const p of PAGES) {
      const en = await boxes(page, p.path, p.who, "en", baseURL ?? "");
      const ru = await boxes(page, p.path, p.who, "ru", baseURL ?? "");
      if (en.length !== ru.length)
        diffs.push(`${p.path}: ${en.length} vs ${ru.length} elements`);
      en.forEach((a, i) => {
        const b = ru[i];
        if (!b) return;
        const moved =
          Math.abs(a.x - b.x) > 1 ||
          Math.abs(a.y - b.y) > 1 ||
          Math.abs(a.w - b.w) > 1 ||
          Math.abs(a.h - b.h) > 1;
        if (moved)
          diffs.push(
            `${p.path} ${a.tag} "${a.text}"→"${b.text}" ${a.x},${a.y} ${a.w}×${a.h} vs ${b.x},${b.y} ${b.w}×${b.h}`,
          );
      });
    }
    expect(diffs).toEqual([]);
  });
