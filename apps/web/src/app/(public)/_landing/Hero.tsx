import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EXAMPLE_ACTION, type Live } from "./live";

export const OVERVIEW_URL =
  "https://github.com/savvax/qupon/blob/main/docs/TECHNICAL_OVERVIEW.md";

export async function Hero({ live }: { live: Live }) {
  const t = await getTranslations("landing");
  const locale = (await getLocale()) === "ru" ? "ru" : "en";
  const last = live.last ?? EXAMPLE_ACTION;
  return (
    <section className="px-4 pt-6 sm:px-6">
      <div className="relative mx-auto max-w-[1200px] overflow-hidden rounded-hero bg-p900 text-white">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(110%_90%_at_90%_0%,var(--color-p500)_0%,transparent_55%),radial-gradient(70%_80%_at_0%_100%,var(--color-g700)_0%,transparent_60%)] opacity-70"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.045)_1px,transparent_1px)] bg-[size:28px_28px]"
        />
        <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-[1.3fr_1fr] lg:items-center lg:gap-14 lg:p-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold ring-1 ring-white/15">
              <span className="size-1.5 rounded-full bg-g400" />
              {t("hero.badge")}
            </span>
            <h1 className="mt-5 text-[2rem] leading-[1.1] font-extrabold tracking-tight text-balance sm:text-5xl">
              {t("hero.title")}
            </h1>
            <p className="mt-5 max-w-xl text-base text-p100 sm:text-lg">
              {t("hero.lead")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="primaryOnDark" size="lg">
                <Link href="/login">
                  {t("hero.cta")} <span aria-hidden>→</span>
                </Link>
              </Button>
              <Button asChild variant="secondaryOnDark" size="lg">
                <a href={OVERVIEW_URL}>{t("hero.overview")}</a>
              </Button>
            </div>
          </div>

          <div className="rounded-card bg-n0 p-5 text-n900 shadow-[0_24px_64px_-24px_rgba(0,0,0,.55)] sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-n600">
                {t("last.title")}
              </span>
              <Badge status="Completed">{t("last.completed")}</Badge>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-xl font-extrabold">{last.ticker}</span>
              <span className="text-sm text-n500">
                {last.kind} · {t(`kinds.${last.kind}`)}
              </span>
            </div>
            <div className="mt-5 text-xs font-semibold text-n500">
              {t("last.total")}
            </div>
            <Amount
              minor={last.totalMinor}
              currency={last.currency}
              locale={locale}
              className="text-3xl font-extrabold"
            />
            <div className="mt-1 text-sm text-n600">
              {t("last.holders", { count: last.holders })}
            </div>
            <div className="mt-5 flex gap-1" aria-hidden>
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className="h-1.5 flex-1 rounded-full bg-g500" />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-n500">
              <span>{t("last.steps")}</span>
              {last.sig ? (
                <Address value={last.sig} kind="tx" />
              ) : (
                <span>{t("last.example")}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
