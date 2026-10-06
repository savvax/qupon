import { ApiError } from "@/lib/api";
import type { KaseBond, KaseNews } from "@/lib/kase";
import type { MockHandler } from "./types";

/** Mock-mode fixtures for the `kase` feature: the normalised TEBNb10/ASBN
 * bodies captured in services/registrar/internal/kase/testdata (task 1002). */

const MINT_QPNB1 = "QpNb1Dem0BondMint1111111111111111111111111111";
const MINT_BTRK = "BTRKDeM0BondMint1111111111111111111111111111";

/** Normalised from bond/characteristics/coupon-payments/trade-info fixtures
 * (see internal/kase/normalize_test.go for the expected field values). */
const TEBNb10: KaseBond = {
  ticker: "TEBNb10",
  isin: "KZ2C00000065",
  issuer: "ForteBank",
  issuerCode: "ASBN",
  currency: "KZT",
  face: 1, // 0,01 KZT nominal
  couponRate: 800,
  frequency: 2,
  dayCount: "THIRTY_360",
  issueDate: "2006-11-29",
  maturityDate: "2026-11-29",
  schedule: [
    {
      recordDate: "2007-05-28",
      start: "2007-05-29",
      end: "2007-06-08",
      rate: 850,
    },
    {
      recordDate: "2007-11-28",
      start: "2007-11-29",
      end: "2007-12-11",
      rate: 850,
    },
    {
      recordDate: "2008-05-28",
      start: "2008-05-29",
      end: "2008-06-10",
      rate: 850,
    },
    {
      recordDate: "2008-11-28",
      start: "2008-11-29",
      end: "2008-12-11",
      rate: 850,
    },
    {
      recordDate: "2009-05-28",
      start: "2009-05-29",
      end: "2009-06-10",
      rate: 850,
    },
    {
      recordDate: "2009-11-28",
      start: "2009-11-29",
      end: "2009-12-11",
      rate: 850,
    },
    {
      recordDate: "2010-03-14",
      start: "2010-03-15",
      end: "2010-03-31",
      rate: 680,
    },
    {
      recordDate: "2010-05-28",
      start: "2010-05-29",
      end: "2010-06-11",
      rate: 800,
    },
    {
      recordDate: "2010-11-28",
      start: "2010-11-29",
      end: "2010-12-10",
      rate: 800,
    },
    {
      recordDate: "2011-05-28",
      start: "2011-05-29",
      end: "2011-06-10",
      rate: 800,
    },
    {
      recordDate: "2011-11-28",
      start: "2011-11-29",
      end: "2011-12-12",
      rate: 800,
    },
    {
      recordDate: "2012-05-28",
      start: "2012-05-29",
      end: "2012-06-11",
      rate: 800,
    },
    {
      recordDate: "2012-11-28",
      start: "2012-11-29",
      end: "2012-12-12",
      rate: 800,
    },
    {
      recordDate: "2013-05-28",
      start: "2013-05-29",
      end: "2013-06-11",
      rate: 800,
    },
    {
      recordDate: "2013-11-28",
      start: "2013-11-29",
      end: "2013-12-12",
      rate: 800,
    },
    {
      recordDate: "2014-05-28",
      start: "2014-05-29",
      end: "2014-06-11",
      rate: 800,
    },
    {
      recordDate: "2014-11-28",
      start: "2014-11-29",
      end: "2014-12-12",
      rate: 800,
    },
    {
      recordDate: "2015-05-28",
      start: "2015-05-29",
      end: "2015-06-11",
      rate: 800,
    },
    {
      recordDate: "2015-11-28",
      start: "2015-11-29",
      end: "2015-12-11",
      rate: 800,
    },
    {
      recordDate: "2016-05-28",
      start: "2016-05-29",
      end: "2016-06-10",
      rate: 800,
    },
    {
      recordDate: "2016-11-28",
      start: "2016-11-29",
      end: "2016-12-12",
      rate: 800,
    },
    {
      recordDate: "2017-05-28",
      start: "2017-05-29",
      end: "2017-06-09",
      rate: 800,
    },
    {
      recordDate: "2017-11-28",
      start: "2017-11-29",
      end: "2017-12-12",
      rate: 800,
    },
    {
      recordDate: "2018-05-28",
      start: "2018-05-29",
      end: "2018-06-11",
      rate: 800,
    },
    {
      recordDate: "2018-11-28",
      start: "2018-11-29",
      end: "2018-12-12",
      rate: 800,
    },
    {
      recordDate: "2019-05-28",
      start: "2019-05-29",
      end: "2019-06-11",
      rate: 800,
    },
    {
      recordDate: "2019-11-28",
      start: "2019-11-29",
      end: "2019-12-12",
      rate: 800,
    },
    {
      recordDate: "2020-05-28",
      start: "2020-05-29",
      end: "2020-06-11",
      rate: 800,
    },
    {
      recordDate: "2020-11-28",
      start: "2020-11-29",
      end: "2020-12-11",
      rate: 800,
    },
    {
      recordDate: "2021-05-28",
      start: "2021-05-29",
      end: "2021-06-11",
      rate: 800,
    },
    {
      recordDate: "2021-11-28",
      start: "2021-11-29",
      end: "2021-12-10",
      rate: 800,
    },
    {
      recordDate: "2022-05-28",
      start: "2022-05-29",
      end: "2022-06-10",
      rate: 800,
    },
    {
      recordDate: "2022-11-28",
      start: "2022-11-29",
      end: "2022-12-12",
      rate: 800,
    },
    {
      recordDate: "2023-05-28",
      start: "2023-05-29",
      end: "2023-06-09",
      rate: 800,
    },
    {
      recordDate: "2023-11-28",
      start: "2023-11-29",
      end: "2023-12-12",
      rate: 800,
    },
    {
      recordDate: "2024-05-28",
      start: "2024-05-29",
      end: "2024-06-11",
      rate: 800,
    },
    {
      recordDate: "2024-11-28",
      start: "2024-11-29",
      end: "2024-12-12",
      rate: 800,
    },
    {
      recordDate: "2025-05-28",
      start: "2025-05-29",
      end: "2025-06-11",
      rate: 800,
    },
    {
      recordDate: "2025-11-28",
      start: "2025-11-29",
      end: "2025-12-12",
      rate: 800,
    },
    {
      recordDate: "2026-05-28",
      start: "2026-05-29",
      end: "2026-06-11",
      rate: 800,
    },
    {
      recordDate: "2026-11-28",
      start: "2026-11-29",
      end: "2026-12-11",
      rate: 800,
    },
  ],
  market: {
    price: 67.52,
    bid: 67.5249,
    offer: 84.7279,
    volume: 10106888.28,
    date: "2026-10-06",
    lastDeals: [],
  },
  stale: false,
  fetchedAt: "2026-10-06T12:00:00Z",
};

const news = (lang: "en" | "ru"): KaseNews => ({
  issuer: "ASBN",
  lang,
  items:
    lang === "ru"
      ? [
          {
            id: 1575988,
            date: "2026-09-18T19:38:00",
            language: "ru",
            subject: "ForteBank объявляет о начале размещения облигаций",
            body: "АО «ForteBank» сообщает о начале размещения субординированных облигаций.",
          },
          {
            id: 1575901,
            date: "2026-09-10T10:02:00",
            language: "ru",
            subject: "ForteBank опубликовал отчётность за август 2026 года",
            body: "Опубликована консолидированная отчётность АО «ForteBank».",
          },
        ]
      : [
          {
            id: 1576006,
            date: "2026-09-18T19:38:00",
            language: "en",
            subject:
              "As of September 21, securities of 48 titles will be included in T+ List and T+ Collateral List",
            body: "/KACC, September 18, 2026/ – By a decision of the Market Risk Committee…",
          },
          {
            id: 1576001,
            date: "2026-09-10T10:02:00",
            language: "en",
            subject: "ForteBank publishes August 2026 results",
            body: "JSC ForteBank has published its consolidated results.",
          },
        ],
  stale: false,
  fetchedAt: "2026-10-06T12:00:00Z",
});

export const handlers: MockHandler[] = [
  // Series → ticker links: the demo QPNb1 series mirrors TEBNb10; BTRKb33
  // exercises the unavailable state (kase.kz down → the page still renders).
  {
    method: "GET",
    path: /^\/kase\/series\/([^/]+)$/,
    reply: (m) => {
      if (m[1] === MINT_QPNB1) return { ticker: "TEBNb10" };
      if (m[1] === MINT_BTRK) return { ticker: "BTRKb33" };
      throw new ApiError(
        404,
        "no_kase_ticker",
        `series ${m[1]} has no KASE ticker`,
      );
    },
  },
  {
    method: "GET",
    path: /^\/kase\/bonds\/([^/]+)$/,
    reply: (m) => {
      if (m[1] === "TEBNb10") return TEBNb10;
      if (m[1] === "BTRKb33")
        throw new ApiError(502, "kase_unavailable", "kase.kz is unavailable");
      throw new ApiError(404, "kase_not_found", `kase.kz has no bond ${m[1]}`);
    },
  },
  {
    method: "GET",
    path: /^\/kase\/news\/([^/]+)$/,
    reply: (m, _body, query) => {
      if (m[1] !== "ASBN")
        throw new ApiError(
          404,
          "kase_not_found",
          `kase.kz has no issuer ${m[1]}`,
        );
      return news(query.get("lang") === "en" ? "en" : "ru");
    },
  },
];
