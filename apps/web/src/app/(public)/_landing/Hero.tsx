import { StableText } from "@/components/i18n/StableLabel";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { HeroBackdrop } from "./HeroBackdrop";
import { HeroLifecycle } from "./HeroLifecycle";
import { EXAMPLE_ACTION, type Live } from "./live";

export const OVERVIEW_URL =
  "https://github.com/savvax/qupon/blob/main/docs/TECHNICAL_OVERVIEW.md";

export async function Hero({ live }: { live: Live }) {
  const t = await getTranslations("landing");
  const locale = (await getLocale()) === "ru" ? "ru" : "en";
  const last = live.last ?? EXAMPLE_ACTION;
  return (
    <section className="px-4 pt-6 sm:px-6">
      {/* Fixed heights per breakpoint: switching EN ↔ RU never resizes the hero (spec §5.8). */}
      <div className="relative mx-auto h-[840px] max-w-[1200px] overflow-hidden rounded-hero bg-p900 text-white min-[360px]:h-[800px] sm:h-[740px] lg:h-[560px]">
        <HeroBackdrop />
        <div className="relative grid h-full grid-cols-[minmax(0,1fr)] content-center gap-8 p-5 sm:p-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:p-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold ring-1 ring-white/15">
              <span className="relative flex size-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-g400 opacity-60" />
                <span className="size-1.5 rounded-full bg-g400" />
              </span>
              {t("hero.badge")}
            </span>
            <h1 className="mt-5 text-[clamp(1.85rem,1.1rem+2.6vw,2.9rem)] leading-[1.08] font-extrabold tracking-tight text-balance">
              <StableText>{t("hero.title")}</StableText>
            </h1>
            <p className="mt-5 max-w-xl text-base text-p100 sm:text-lg">
              <StableText>{t("hero.lead")}</StableText>
            </p>
            <div className="mt-8 flex flex-col gap-3 min-[480px]:flex-row">
              <Button asChild variant="primaryOnDark" size="lg">
                <Link href="/login?choose=1">
                  {t("hero.cta")} <span aria-hidden>→</span>
                </Link>
              </Button>
              <Button asChild variant="secondaryOnDark" size="lg">
                <a href={OVERVIEW_URL}>{t("hero.overview")}</a>
              </Button>
            </div>
          </div>

          <HeroLifecycle last={last} locale={locale} />
        </div>
      </div>
    </section>
  );
}
