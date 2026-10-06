import { getLocale, getTranslations } from "next-intl/server";
import type { Live } from "./live";

/** Active series as chips + the on-chain transaction count. Renders nothing when the API is down. */
export async function LiveStrip({ live }: { live: Live }) {
  if (live.active.length === 0 && live.txCount === 0) return null;
  const t = await getTranslations("landing.strip");
  const locale = await getLocale();
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Almaty",
  });
  const chip =
    "inline-flex shrink-0 items-center gap-2 rounded-full border border-n200 bg-n0 px-3.5 py-1.5 text-sm whitespace-nowrap text-n700";
  return (
    // One scrollable row (no wrapping): RU dates are longer and must not push the page down (spec §5.8).
    <div className="mx-auto flex max-w-[1200px] [scrollbar-width:none] gap-2 overflow-x-auto px-4 pt-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
      {live.active.map((s) => (
        <a
          key={s.mint}
          href={`/bonds/${s.mint}`}
          className={`${chip} hover:border-n300 hover:text-n900`}
        >
          <span className="font-bold text-n900">{s.ticker}</span>
          <span className="num">
            {t("coupon", { rate: s.couponRateBps / 100 })}
          </span>
          <span className="text-n400">·</span>
          <span>
            {t("next", { date: date.format(new Date(s.nextCouponDate)) })}
          </span>
        </a>
      ))}
      {live.txCount > 0 && (
        <span className={chip}>
          <span className="size-1.5 rounded-full bg-g500" />
          <span className="num">
            {t("txs", { count: live.txCount, more: live.txMore ? "+" : "" })}
          </span>
        </span>
      )}
    </div>
  );
}
