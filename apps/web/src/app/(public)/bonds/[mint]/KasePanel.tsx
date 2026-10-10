import { Badge } from "@/components/ui/Badge";
import { bpsToPercent, civilDate, formatDate } from "@/lib/format";
import { getKaseBond, getKaseNews, type KaseNews } from "@/lib/kase";
import { getTranslations } from "next-intl/server";
import { type Locale } from "@/i18n/locale";

/** One last-deals chip: "price × qty" when kase.kz's raw row carries them. */
function DealChip({
  deal,
  locale,
}: {
  deal: Record<string, unknown>;
  locale: Locale;
}) {
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const price = num(deal.price);
  const qty = num(deal.qty) ?? num(deal.quantity);
  const date =
    typeof deal.date0 === "string"
      ? formatDate(civilDate(deal.date0), locale)
      : undefined;
  const text = [
    price !== undefined ? `${price}%` : undefined,
    qty !== undefined ? `× ${qty}` : undefined,
    date,
  ]
    .filter(Boolean)
    .join(" ");
  if (!text) return null;
  return (
    <span className="num rounded-full bg-n100 px-2.5 py-1 text-xs text-n600">
      {text}
    </span>
  );
}

function deals(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (d): d is Record<string, unknown> =>
          typeof d === "object" && d !== null,
      )
    : [];
}

/**
 * KASE market panel for series linked to a kase.kz ticker (platform v2 §5.5,
 * task 1002). Public cached data; never a page dependency — every failure
 * degrades to a small "unavailable" note (review focus: no page breaks).
 */
export async function KasePanel({
  ticker,
  locale,
}: {
  ticker: string;
  locale: Locale;
}) {
  const t = await getTranslations("kase.panel");
  const bond = await getKaseBond(ticker).catch(() => null);
  // The issuer code travels with the bond; news is fetched only once it is known.
  const feed: KaseNews | null = bond?.issuerCode
    ? await getKaseNews(bond.issuerCode, locale).catch(() => null)
    : null;
  const fetched = bond?.fetchedAt
    ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(bond.fetchedAt))
    : "";

  return (
    <section
      data-testid="kase-panel"
      className="rounded-card border border-n200 bg-n0 p-5"
      aria-label={t("title", { ticker })}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-wide text-n600 uppercase">
          {t("title", { ticker })}
        </h2>
        {bond?.stale && <Badge tone="warn">{t("stale")}</Badge>}
      </div>

      {!bond ? (
        <p className="mt-3 text-sm text-n600">{t("unavailable")}</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold text-n500">{t("price")}</dt>
              <dd className="num mt-0.5 font-bold">
                {bond.market.price != null
                  ? bpsToPercent(Math.round(bond.market.price * 100), locale)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-n500">
                {t("bidOffer")}
              </dt>
              <dd className="num mt-0.5">
                {bond.market.bid != null || bond.market.offer != null
                  ? `${bond.market.bid != null ? bpsToPercent(Math.round(bond.market.bid * 100), locale) : "—"} / ${bond.market.offer != null ? bpsToPercent(Math.round(bond.market.offer * 100), locale) : "—"}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-n500">{t("volume")}</dt>
              <dd className="num mt-0.5">
                {bond.market.volume != null
                  ? bond.market.volume.toLocaleString(
                      locale === "en" ? "en-GB" : "ru-RU",
                      { maximumFractionDigits: 0 },
                    )
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-n500">{t("date")}</dt>
              <dd className="num mt-0.5">
                {bond.market.date
                  ? formatDate(civilDate(bond.market.date), locale)
                  : "—"}
              </dd>
            </div>
          </dl>

          <div className="mt-4">
            <h3 className="text-xs font-semibold text-n500">{t("trades")}</h3>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {deals(bond.market.lastDeals)
                .slice(0, 5)
                .map((d, i) => (
                  <DealChip key={i} deal={d} locale={locale} />
                ))}
              {deals(bond.market.lastDeals).length === 0 && (
                <span className="text-xs text-n500">{t("tradesEmpty")}</span>
              )}
            </div>
          </div>

          {feed && feed.items.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-n500">{t("news")}</h3>
              <ul className="mt-1.5 space-y-1.5">
                {feed.items.slice(0, 3).map((it) => (
                  <li key={it.id} className="text-sm text-n900">
                    <span className="num mr-2 text-xs text-n500">
                      {formatDate(civilDate(it.date), locale)}
                    </span>
                    {it.subject}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 text-xs text-n500">
            {t("source", { time: fetched })}
          </p>
        </>
      )}
    </section>
  );
}
