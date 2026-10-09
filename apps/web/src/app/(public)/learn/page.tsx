import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { GlossaryTerm } from "@/components/ui/GlossaryTerm";
import { LifecycleRail, type RailNode } from "@/components/ui/LifecycleRail";
import { MoneyFlow } from "@/components/ui/MoneyFlow";
import { toLocale } from "@/i18n/locale";
import { GLOSSARY } from "@/lib/glossary";
import { metaTitle } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await metaTitle("learn") };
}

const PER = { minor: "5000", currency: "tKZT" }; // 50.00 ₸ per 1,000 ₸ bond, the brief's coupon

/**
 * "How a bond lives on Qupon" (task 1531): a plain-language walkthrough of one coupon (the life on a LifecycleRail,
 * six steps of prose, where the money goes) and then the whole glossary (`#glossary`, linked from the help menu).
 * The brief's numbers throughout; en/ru/kk from the `learn` and `kit.glossary` messages.
 */
export default async function LearnPage() {
  const [t, tg, locale] = await Promise.all([
    getTranslations("learn"),
    getTranslations("kit.glossary"),
    getLocale(),
  ]);
  const loc = toLocale(locale);

  // An illustrative two-year bond: coupon 1 paid, coupon 2 in progress, the last one paid with the principal.
  const rail: RailNode[] = [
    {
      id: "issue",
      kind: "issue",
      title: t("hero.issue"),
      date: "2025-11-01T00:00:00+05:00",
      status: "done",
      statusLabel: t("hero.issued"),
      txCount: 3,
    },
    {
      id: "c1",
      kind: "coupon",
      title: t("hero.coupon", { n: 1 }),
      date: "2026-05-01T00:00:00+05:00",
      status: "done",
      amount: PER,
      txCount: 7,
    },
    {
      id: "c2",
      kind: "coupon",
      title: t("hero.coupon", { n: 2 }),
      date: "2026-11-01T00:00:00+05:00",
      status: "live",
      amount: PER,
    },
    {
      id: "c3",
      kind: "coupon",
      title: t("hero.coupon", { n: 3 }),
      date: "2027-05-01T00:00:00+05:00",
      status: "upcoming",
      amount: PER,
    },
    {
      id: "mat",
      kind: "maturity",
      title: t("hero.maturity"),
      date: "2027-11-01T00:00:00+05:00",
      status: "upcoming",
      amount: { minor: "105000", currency: "tKZT" },
    },
  ];

  const steps = (["s1", "s2", "s3", "s4", "s5", "s6"] as const).map((k) => ({
    k,
    title: t(`steps.${k}.title`),
    body: t(`steps.${k}.body`),
  }));

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="text-title font-extrabold tracking-tight text-balance">
          {t("meta.title")}
        </h1>
        <p className="mt-3 text-base text-n700 sm:text-lg">
          {t("hero.lead1")}{" "}
          <GlossaryTerm term="recordDate">
            {t("hero.termRecordDate")}
          </GlossaryTerm>
          {t("hero.lead2")}
        </p>
      </header>

      <div className="mt-8">
        <LifecycleRail locale={loc} title={t("hero.railTitle")} nodes={rail} />
      </div>

      <section className="mt-12">
        <h2 className="text-lg font-bold">{t("steps.title")}</h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {steps.map((s) => (
            <li
              key={s.k}
              className="rounded-card border border-n200 bg-n0 p-5"
            >
              <h3 className="font-bold text-n900">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-n700">
                {s.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <MoneyFlow
          currency="tKZT"
          locale={loc}
          issuer={{ label: "QPNb1" }}
          escrow={{ required: "500000", funded: "500000" }}
          recipients={[
            {
              id: "a",
              kind: "holder",
              label: t("money.holder", { name: "A" }),
              sub: t("money.holderSub", { units: "10" }),
              amount: "50000",
              status: "paid",
            },
            {
              id: "b",
              kind: "holder",
              label: t("money.holder", { name: "B" }),
              sub: t("money.holderSub", { units: "25" }),
              amount: "125000",
              status: "paid",
            },
            {
              id: "c",
              kind: "holder",
              label: t("money.holder", { name: "C" }),
              sub: t("money.holderSub", { units: "65" }),
              amount: "325000",
              status: "paid",
            },
          ]}
          example
          sampleTx
        />
        <p className="mt-3 max-w-[62ch] text-sm text-n600">{t("money.lead")}</p>
      </section>

      <section id="glossary" className="mt-12 scroll-mt-24">
        <h2 className="text-lg font-bold">{t("gloss.title")}</h2>
        <p className="mt-1 max-w-[62ch] text-sm text-n600">{t("gloss.lead")}</p>
        <dl className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          {GLOSSARY.map((k) => (
            <div key={k} id={`term-${k}`} className="min-w-0 scroll-mt-24">
              <dt className="text-sm font-bold text-n900">{tg(`${k}.term`)}</dt>
              <dd className="mt-0.5 text-sm leading-relaxed text-n700">{tg(`${k}.def`)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12 rounded-card border border-n200 bg-n0 p-5 sm:p-6">
        <p className="max-w-[62ch] text-sm text-n700">{t("cta.lead")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/sandbox/new">{t("cta.sandbox")}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/bonds">{t("cta.bonds")}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
