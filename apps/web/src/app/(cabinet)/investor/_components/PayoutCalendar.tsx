"use client";

/**
 * Payout calendar (plan 15 task 1533): the next 12 months of record/payment dates from the public holder lookup
 * `GET /holders/{owner}` — one entry per series (the open action's dates, or the projected next coupon through the
 * series clock). Months without events stay visible: a calendar shows time, not only events.
 */
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { type UpcomingPayout, payoutCalendar } from "@/lib/holder";
import { formatDate } from "@/lib/format";
import { type Locale } from "@/i18n/locale";

const MONTH = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
});

function monthLabel(key: string, locale: Locale): string {
  const [y, m] = key.split("-").map(Number);
  return locale === "en"
    ? MONTH.format(new Date(Date.UTC(y!, m! - 1, 1)))
    : `${String(m).padStart(2, "0")}.${y}`;
}

export function PayoutCalendar({
  upcoming,
  loading,
}: {
  upcoming: UpcomingPayout[];
  loading: boolean;
}) {
  const t = useTranslations("investor.calendar");
  const locale = useLocale() as Locale;
  const months = payoutCalendar(upcoming);
  const events = months.reduce((n, m) => n + m.events.length, 0);
  if (loading) return <Skeleton className="h-40" />;
  return (
    <section aria-labelledby="payout-calendar">
      <h2 id="payout-calendar" className="mb-3 text-lg font-bold">
        {t("title")}
      </h2>
      <Card>
        {events === 0 ? (
          <p className="py-6 text-center text-sm text-n600">{t("empty")}</p>
        ) : (
          // opus #19: empty months hide on phones (a 12-box grid is ~1,300 px of scroll there); event months keep
          // a min height so the desktop grid still reads as one calendar — no auto-rows-fr, empties no longer stretch
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {months.map((m) => (
              <li
                key={m.key}
                className={
                  m.events.length === 0
                    ? "max-sm:hidden min-h-0 rounded-card border border-n200 p-3 text-sm text-n400"
                    : "min-h-24 rounded-card border border-n200 p-3"
                }
              >
                <div className="num text-xs font-bold text-n500">
                  {monthLabel(m.key, locale)}
                </div>
                <ul className="mt-1.5 space-y-1.5">
                  {m.events.map((ev, i) => (
                    <li
                      key={i}
                      className="flex items-baseline justify-between gap-2 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="font-semibold">
                          {ev.payout.ticker}
                        </span>{" "}
                        <span className="text-n500">{t(ev.kind)}</span>
                      </span>
                      <span className="num text-xs text-n600">
                        {formatDate(ev.date, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs text-n500">{t("note")}</p>
      </Card>
    </section>
  );
}
